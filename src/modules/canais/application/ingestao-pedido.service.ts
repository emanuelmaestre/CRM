"use server";

import { eq, and, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { cliente, clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { produto, produtoCanal } from "@/shared/lib/db/schema/estoque";
import { auditLog } from "@/shared/lib/db/schema/auditoria";
import { pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import {
  despacharEvento,
  despacharEventosPendentes,
  persistirEvento,
  type DomainEventType,
  type PersistedDomainEvent,
} from "@/shared/events";
import type { PedidoNormalizado } from "../domain/ports";
import { ErroSkuSemProduto } from "../domain/errors";
import { deveAplicarStatusMarketplace, deveExecutarEfeitosOperacionais, mapearStatusPedido } from "../domain/order-status";

type CanalSuportado = "shopee" | "mercadolivre" | "tiktokshop";

function toCanal(canal: string): CanalSuportado {
  if (canal === "shopee" || canal === "mercadolivre" || canal === "tiktokshop") return canal;
  throw new Error(`Canal de pedido não suportado: ${canal}.`);
}

const PedidoIngestaoSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
  channelAccountId: z.uuid(),
  providerOrderId: z.string().min(1),
  clienteExternalId: z.string().min(1),
  clienteNome: z.string().min(1),
  itens: z.array(z.object({
    skuExterno: z.string().min(1),
    quantidade: z.number().int().positive(),
    precoUnitario: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  })).min(1),
});

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ── O produto pelo anúncio do pedido ──────────────────────────────────────
 *
 *  Última tentativa antes de recusar um item por "SKU sem produto". Existe
 *  porque o SKU sozinho não é chave estável: o pedido guarda o que o SKU era
 *  no dia da compra, e o anúncio pode ter sido renomeado, pausado ou excluído
 *  desde então. Medido em 29/08/2026 na WUWU — 40 pedidos parados, R$
 *  1.344,20, de 03/06 a 04/08, todos de anúncio fora do ar ou de SKU trocado
 *  depois da venda.
 *
 *  Duas saídas, nesta ordem:
 *
 *  1. O anúncio já tem vínculo nesta conta → é aquele produto, com outro nome
 *     de SKU. Casar aqui evita criar um segundo cadastro do mesmo produto.
 *  2. Anúncio desconhecido → o produto nasce com o que o próprio pedido
 *     informa (SKU, título e preço da venda). Continua sendo o canal criando
 *     o produto, nunca cadastro manual: o pedido é dado do canal como o
 *     catálogo é. É o único caminho para anúncio EXCLUÍDO, que a busca de
 *     itens do Mercado Livre não devolve mais (`status=closed` volta vazio).
 *
 *  Sem `listingId` (canal que ainda não preenche) ou sem título, devolve null
 *  e o item segue recusado como antes — a fila de não importados continua
 *  sendo a rede de segurança. */
async function resolverPeloAnuncioDoPedido(
  tx: Transacao,
  entrada: {
    orgId: string;
    brandId: string;
    channelAccountId: string;
    userId: string | null;
    item: PedidoNormalizado["itens"][number];
  },
): Promise<{ produtoId: string; evento?: PersistedDomainEvent } | null> {
  const { orgId, brandId, channelAccountId, item } = entrada;
  if (!item.listingId) return null;

  const vinculado = await tx
    .select({ produtoId: produtoCanal.produtoId })
    .from(produtoCanal)
    .innerJoin(produto, and(
      eq(produto.id, produtoCanal.produtoId),
      eq(produto.orgId, produtoCanal.orgId),
    ))
    .where(and(
      eq(produtoCanal.orgId, orgId),
      eq(produtoCanal.channelAccountId, channelAccountId),
      eq(produtoCanal.externalListingId, item.listingId),
      item.variationId
        ? eq(produtoCanal.externalWarehouseId, item.variationId)
        : isNull(produtoCanal.externalWarehouseId),
      eq(produto.brandId, brandId),
      isNull(produto.deletedAt),
    ))
    .then((rows) => rows[0]);
  if (vinculado) return { produtoId: vinculado.produtoId };

  if (!item.titulo) return null;

  /* `onConflictDoNothing` + releitura em vez de insert direto: dois pedidos do
     mesmo SKU novo podem estar sendo ingeridos ao mesmo tempo (o lock por
     pedido não serializa isso), e o índice único (org, marca, sku) faria o
     segundo estourar. */
  const [criado] = await tx
    .insert(produto)
    .values({
      orgId,
      brandId,
      sku: item.skuExterno,
      nome: item.titulo,
      preco: item.precoUnitario,
      estoqueMinimo: 0,
      ativo: true,
    })
    .onConflictDoNothing()
    .returning();

  const produtoId = criado?.id ?? await tx
    .select({ id: produto.id })
    .from(produto)
    .where(and(
      eq(produto.orgId, orgId),
      eq(produto.brandId, brandId),
      eq(produto.sku, item.skuExterno),
      isNull(produto.deletedAt),
    ))
    .then((rows) => rows[0]?.id);
  if (!produtoId) return null;

  /* O vínculo é o que faz o PRÓXIMO pedido do mesmo anúncio casar pelo
     caminho 1, mesmo que o SKU mude de novo. Sem saldo semeado de propósito:
     o pedido não informa estoque, e inventar zero aqui seria dado que ninguém
     mediu — quem preenche é a coleta (A5). */
  await tx
    .insert(produtoCanal)
    .values({
      orgId,
      produtoId,
      channelAccountId,
      externalListingId: item.listingId,
      externalSkuId: item.skuExterno,
      externalWarehouseId: item.variationId ?? null,
      ativo: true,
    })
    .onConflictDoNothing();

  if (!criado) return { produtoId };

  await tx.insert(auditLog).values({
    orgId,
    brandId,
    autorId: entrada.userId,
    autorTipo: entrada.userId ? "usuario" : "sistema",
    entidade: "produto",
    entidadeId: criado.id,
    acao: "create",
    depois: criado,
  });

  const evento = await persistirEvento({
    tipo: "produto.criado",
    orgId,
    brandId,
    entidade: "produto",
    entidadeId: criado.id,
    payload: { sku: criado.sku, nome: criado.nome, origem: "pedido-sem-catalogo" },
  }, tx);

  return { produtoId, evento };
}

export async function ingerirPedido(
  orgId: string,
  brandId: string,
  channelAccountId: string,
  p: PedidoNormalizado
): Promise<{ pedidoId: string; novo: boolean }> {
  PedidoIngestaoSchema.parse({ orgId, brandId, channelAccountId, ...p });
  const canal = toCanal(p.canal);

  const existente = await db
    .select({ id: pedido.id })
    .from(pedido)
    .where(and(
      eq(pedido.providerOrderId, p.providerOrderId),
      eq(pedido.channelAccountId, channelAccountId),
      eq(pedido.orgId, orgId),
    ))
    .then((r) => r[0]);

  if (existente) {
    await reconciliarFinanceiroPedido(orgId, existente.id, p);
    await reconciliarStatusPedido(orgId, brandId, existente.id, p.status);
    return { pedidoId: existente.id, novo: false };
  }

  let persistido: { pedidoId: string; eventos: PersistedDomainEvent[]; novo: boolean };

  try {
    persistido = await db.transaction(async (tx) => {
    const conta = await tx
      .select({ id: channelAccount.id })
      .from(channelAccount)
      .where(and(
        eq(channelAccount.id, channelAccountId),
        eq(channelAccount.orgId, orgId),
        eq(channelAccount.brandId, brandId),
        eq(channelAccount.tipo, canal),
      ))
      .then((rows) => rows[0]);
    if (!conta) throw new Error("Conta de canal não pertence à organização, marca e canal informados.");

    // Serializa somente tentativas do mesmo pedido. Isso evita que duas entregas
    // simultâneas criem cliente/identidade antes de a constraint do pedido atuar.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${channelAccountId}:${p.providerOrderId}`}, 0))`);
    const pedidoConcorrente = await tx
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, orgId),
        eq(pedido.channelAccountId, channelAccountId),
        eq(pedido.providerOrderId, p.providerOrderId),
      ))
      .then((rows) => rows[0]);
    if (pedidoConcorrente) return { pedidoId: pedidoConcorrente.id, eventos: [], novo: false };

    const skus = [...new Set(p.itens.map((item) => item.skuExterno))];
    // Duas chaves resolvem um item de pedido, nesta ordem de precedência:
    //
    // 1. `produto.sku` de qualquer produto ativo da marca — o vendedor usa o
    //    mesmo SKU interno nos vários marketplaces, então um produto que hoje
    //    só tem vínculo com o Mercado Livre ainda é o produto certo pra um
    //    pedido da Shopee com aquele SKU. Antes a busca partia de
    //    `produto_canal` filtrado por channelAccountId, o que descartava esses
    //    produtos antes de chegar no map e derrubava a ingestão inteira
    //    (erro real em 25/08/2026: "SKUs sem produto na marca: KIT3_ICONIC,
    //    KIT4_HERITAGE" — os dois existiam na marca, só que vinculados ao ML).
    // 2. `produto_canal.external_sku_id` desta conta de canal, que vence em
    //    caso de conflito: é o mapeamento explícito daquele canal.
    const [produtosDaMarca, vinculosDoCanal] = await Promise.all([
      tx
        .select({ id: produto.id, sku: produto.sku })
        .from(produto)
        .where(and(
          eq(produto.orgId, orgId),
          eq(produto.brandId, brandId),
          isNull(produto.deletedAt),
        )),
      tx
        .select({ produtoId: produtoCanal.produtoId, externalSkuId: produtoCanal.externalSkuId })
        .from(produtoCanal)
        .innerJoin(produto, and(
          eq(produto.id, produtoCanal.produtoId),
          eq(produto.orgId, produtoCanal.orgId),
        ))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.channelAccountId, channelAccountId),
          eq(produtoCanal.ativo, true),
          eq(produto.orgId, orgId),
          eq(produto.brandId, brandId),
          isNull(produto.deletedAt),
        )),
    ]);
    const produtoPorSku = new Map<string, string>();
    for (const item of produtosDaMarca) produtoPorSku.set(item.sku, item.id);
    for (const vinculo of vinculosDoCanal) {
      if (vinculo.externalSkuId) produtoPorSku.set(vinculo.externalSkuId, vinculo.produtoId);
    }
    // 3. O anúncio de onde a venda saiu, quando o SKU não resolve nada — ver
    //    `resolverPeloAnuncioDoPedido`.
    const skusAusentes = skus.filter((sku) => !produtoPorSku.has(sku));
    const eventosDeProduto: PersistedDomainEvent[] = [];
    for (const sku of skusAusentes) {
      const item = p.itens.find((linha) => linha.skuExterno === sku)!;
      const resolvido = await resolverPeloAnuncioDoPedido(tx, {
        orgId, brandId, channelAccountId, userId: null, item,
      });
      if (!resolvido) continue;
      produtoPorSku.set(sku, resolvido.produtoId);
      if (resolvido.evento) eventosDeProduto.push(resolvido.evento);
    }
    const aindaAusentes = skusAusentes.filter((sku) => !produtoPorSku.has(sku));
    if (aindaAusentes.length > 0) {
      throw new ErroSkuSemProduto(aindaAusentes);
    }

    let clienteId: string;
    const identidade = await tx
      .select({ clienteId: clienteIdentidade.clienteId })
      .from(clienteIdentidade)
      .where(and(
        eq(clienteIdentidade.orgId, orgId),
        eq(clienteIdentidade.canal, canal),
        eq(clienteIdentidade.externalId, p.clienteExternalId),
      ))
      .then((rows) => rows[0]);

    if (identidade) {
      clienteId = identidade.clienteId;

      // Comprador recorrente: o primeiro pedido do Mercado Livre às vezes chega
      // sem e-mail (a API omite o campo em parte dos fluxos de privacidade), mas
      // um pedido seguinte pode trazer o dado. Sem este backfill, o cadastro
      // ficava com e-mail vazio para sempre — a primeira chance era a única.
      // O pré-checa evita colidir com a constraint de unicidade (org, email):
      // um pedido não pode falhar por causa de um enriquecimento de cadastro.
      if (p.clienteEmail) {
        const emailEmUso = await tx
          .select({ id: cliente.id })
          .from(cliente)
          .where(and(
            eq(cliente.orgId, orgId),
            eq(cliente.email, p.clienteEmail),
            isNull(cliente.deletedAt),
          ))
          .then((rows) => rows[0]);
        if (!emailEmUso) {
          await tx
            .update(cliente)
            .set({ email: p.clienteEmail, updatedAt: new Date() })
            .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId), isNull(cliente.email)));
        }
      }

      // Mesma lógica para nome completo e endereço de entrega, com uma
      // diferença: endereço nunca é sobrescrito, mesmo que já exista um valor
      // preenchido (o backfill de e-mail e nome completo verifica só se está
      // vazio — endereço poderia legitimamente já ter outro valor de um
      // pedido anterior, e um comprador recorrente pode enviar para um
      // endereço diferente a cada compra. Sobrescrever silenciosamente
      // trocaria o endereço "correto" pelo do pedido mais recente, o que é
      // mais enganoso do que só não preencher — por isso o gate aqui é
      // idêntico ao de cima (`isNull`), sem exceção.
      if (p.clienteEndereco?.nomeDestinatario) {
        await tx
          .update(cliente)
          .set({ nomeCompleto: p.clienteEndereco.nomeDestinatario, updatedAt: new Date() })
          .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId), isNull(cliente.nomeCompleto)));
      }
      if (p.clienteEndereco?.cep) {
        await tx
          .update(cliente)
          .set({
            enderecoRua: p.clienteEndereco.rua,
            enderecoNumero: p.clienteEndereco.numero,
            enderecoComplemento: p.clienteEndereco.complemento,
            enderecoBairro: p.clienteEndereco.bairro,
            enderecoCidade: p.clienteEndereco.cidade,
            enderecoEstado: p.clienteEndereco.estado,
            enderecoCep: p.clienteEndereco.cep,
            enderecoLatitude: p.clienteEndereco.latitude,
            enderecoLongitude: p.clienteEndereco.longitude,
            updatedAt: new Date(),
          })
          .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId), isNull(cliente.enderecoCep)));
      }
    } else {
      // Antes de criar, procura um cliente ativo da org com o mesmo e-mail ou
      // telefone. A mesma pessoa comprando em canais diferentes (ou com duas
      // contas no mesmo canal) não tem `cliente_identidade` para este canal,
      // mas é o mesmo cliente — e `uq_cliente_org_telefone_active` /
      // `uq_cliente_org_email_active` garantem isso no banco. Sem esta busca o
      // insert violava a constraint e derrubava a sincronização inteira (erro
      // real em 25/08/2026, nas duas marcas da Shopee e também no Mercado
      // Livre). É o mesmo tratamento que a importação histórica já fazia; só o
      // fluxo em tempo real estava sem. Reaproveitar o cadastro é também o
      // comportamento certo: `cliente_identidade` existe exatamente para
      // pendurar várias identidades de canal num único cliente.
      const contatos = [
        p.clienteEmail ? eq(cliente.email, p.clienteEmail) : undefined,
        p.clienteTelefone ? eq(cliente.telefone, p.clienteTelefone) : undefined,
      ].filter((condicao): condicao is NonNullable<typeof condicao> => Boolean(condicao));
      const clientePorContato = contatos.length > 0
        ? await tx
            .select({ id: cliente.id })
            .from(cliente)
            .where(and(eq(cliente.orgId, orgId), isNull(cliente.deletedAt), or(...contatos)))
            .then((rows) => rows[0]?.id)
        : undefined;

      if (clientePorContato) {
        clienteId = clientePorContato;
        // Cadastro que já existia pode estar sem endereço/nome completo — o
        // mesmo backfill conservador do ramo do comprador recorrente acima:
        // só preenche o que está vazio, nunca sobrescreve.
        if (p.clienteEndereco?.nomeDestinatario) {
          await tx
            .update(cliente)
            .set({ nomeCompleto: p.clienteEndereco.nomeDestinatario, updatedAt: new Date() })
            .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId), isNull(cliente.nomeCompleto)));
        }
        if (p.clienteEndereco?.cep) {
          await tx
            .update(cliente)
            .set({
              enderecoRua: p.clienteEndereco.rua,
              enderecoNumero: p.clienteEndereco.numero,
              enderecoComplemento: p.clienteEndereco.complemento,
              enderecoBairro: p.clienteEndereco.bairro,
              enderecoCidade: p.clienteEndereco.cidade,
              enderecoEstado: p.clienteEndereco.estado,
              enderecoCep: p.clienteEndereco.cep,
              enderecoLatitude: p.clienteEndereco.latitude,
              enderecoLongitude: p.clienteEndereco.longitude,
              updatedAt: new Date(),
            })
            .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId), isNull(cliente.enderecoCep)));
        }
      } else {
        const [novoCliente] = await tx
          .insert(cliente)
          .values({
            orgId,
            nome: p.clienteNome,
            email: p.clienteEmail,
            telefone: p.clienteTelefone,
            nomeCompleto: p.clienteEndereco?.nomeDestinatario,
            enderecoRua: p.clienteEndereco?.rua,
            enderecoNumero: p.clienteEndereco?.numero,
            enderecoComplemento: p.clienteEndereco?.complemento,
            enderecoBairro: p.clienteEndereco?.bairro,
            enderecoCidade: p.clienteEndereco?.cidade,
            enderecoEstado: p.clienteEndereco?.estado,
            enderecoCep: p.clienteEndereco?.cep,
            enderecoLatitude: p.clienteEndereco?.latitude,
            enderecoLongitude: p.clienteEndereco?.longitude,
          })
          .returning({ id: cliente.id });
        clienteId = novoCliente.id;
      }

      await tx.insert(clienteIdentidade).values({
        clienteId,
        orgId,
        canal,
        externalId: p.clienteExternalId,
      });
    }

    const status = mapearStatusPedido(p.status);
    const [novoPedido] = await tx
      .insert(pedido)
      .values({
        orgId,
        brandId,
        channelAccountId,
        clienteId,
        providerOrderId: p.providerOrderId,
        canal,
        status,
        total: p.total,
        frete: p.frete ?? "0",
        desconto: p.desconto ?? "0",
        acrescimo: p.acrescimo ?? "0",
        valorLiquido: p.valorLiquido,
        createdAt: p.criadoEm,
      })
      .returning({ id: pedido.id });

    await tx.insert(pedidoItem).values(p.itens.map((item) => ({
      pedidoId: novoPedido.id,
      produtoId: produtoPorSku.get(item.skuExterno)!,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      taxaMarketplace: item.taxaMarketplace ?? null,
    })));

    const eventos: PersistedDomainEvent[] = [...eventosDeProduto];
    eventos.push(await persistirEvento({
      tipo: "pedido.recebido",
      orgId,
      brandId,
      entidade: "pedido",
      entidadeId: novoPedido.id,
      payload: { canal, channelAccountId, providerOrderId: p.providerOrderId, total: p.total },
    }, tx));

    if (["pago", "separado", "enviado", "entregue", "concluido"].includes(status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.pago",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: novoPedido.id,
        payload: { status: "pago", statusAnterior: "criado", origemStatus: status },
      }, tx));
    }

    if (["entregue", "concluido"].includes(status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.entregue",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: novoPedido.id,
        payload: { status: "entregue", origemStatus: status },
      }, tx));
    }

    return { pedidoId: novoPedido.id, eventos, novo: true };
    });
  } catch (error) {
    if (!isPedidoDuplicado(error)) throw error;

    const concorrente = await db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, orgId),
        eq(pedido.channelAccountId, channelAccountId),
        eq(pedido.providerOrderId, p.providerOrderId),
      ))
      .then((rows) => rows[0]);
    if (!concorrente) throw error;
    await reconciliarFinanceiroPedido(orgId, concorrente.id, p);
    await reconciliarStatusPedido(orgId, brandId, concorrente.id, p.status);
    return { pedidoId: concorrente.id, novo: false };
  }

  const { pedidoId, eventos, novo } = persistido;

  if (!novo) {
    await reconciliarFinanceiroPedido(orgId, pedidoId, p);
    await reconciliarStatusPedido(orgId, brandId, pedidoId, p.status);
    return { pedidoId, novo: false };
  }

  for (const evento of eventos) await despacharEvento(evento);

  return { pedidoId, novo: true };
}

function isPedidoDuplicado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string };
  const constraint = candidate.constraint_name ?? candidate.constraint;
  return candidate.code === "23505" && constraint === "uq_pedido_org_account_provider";
}

/** Uma nova leitura do mesmo pedido precisa enriquecer valores que a Shopee
 * ainda não tinha liberado no primeiro webhook. Antes, duplicatas atualizavam
 * somente o status e todos os campos financeiros antigos ficavam em zero para
 * sempre, mesmo após uma sincronização manual. */
async function reconciliarFinanceiroPedido(
  orgId: string,
  pedidoId: string,
  p: PedidoNormalizado,
): Promise<void> {
  await db.transaction(async (tx) => {
    const valores: Partial<typeof pedido.$inferInsert> = {
      total: p.total,
      updatedAt: new Date(),
    };
    if (p.frete !== undefined) valores.frete = p.frete;
    if (p.desconto !== undefined) valores.desconto = p.desconto;
    if (p.acrescimo !== undefined) valores.acrescimo = p.acrescimo;
    if (p.valorLiquido !== undefined) valores.valorLiquido = p.valorLiquido;
    await tx.update(pedido).set(valores)
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)));

    const temTaxas = p.itens.some((item) => item.taxaMarketplace !== undefined);
    if (!temTaxas) return;
    const itensPersistidos = await tx
      .select({
        id: pedidoItem.id,
        quantidade: pedidoItem.quantidade,
        precoUnitario: pedidoItem.precoUnitario,
      })
      .from(pedidoItem)
      .where(eq(pedidoItem.pedidoId, pedidoId));
    const taxaCentavos = Math.round(p.itens.reduce(
      (total, item) => total + Number(item.taxaMarketplace ?? 0),
      0,
    ) * 100);
    const pesos = itensPersistidos.map((item) => Number(item.precoUnitario) * item.quantidade);
    const pesoTotal = pesos.reduce((total, peso) => total + peso, 0);
    let restante = taxaCentavos;
    for (let indice = 0; indice < itensPersistidos.length; indice++) {
      const centavos = indice === itensPersistidos.length - 1
        ? restante
        : Math.min(restante, Math.round(taxaCentavos * (pesoTotal > 0 ? pesos[indice] / pesoTotal : 1 / Math.max(itensPersistidos.length, 1))));
      restante -= centavos;
      await tx.update(pedidoItem)
        .set({ taxaMarketplace: (centavos / 100).toFixed(2) })
        .where(eq(pedidoItem.id, itensPersistidos[indice].id));
    }
  });
}

async function reconciliarStatusPedido(
  orgId: string,
  brandId: string,
  pedidoId: string,
  statusExterno: string,
): Promise<void> {
  const novoStatus = mapearStatusPedido(statusExterno);
  const resultado = await db.transaction(async (tx) => {
    const atual = await tx
      .select({
        status: pedido.status,
        brandId: pedido.brandId,
        origemIngestao: pedido.origemIngestao,
        providerOrderId: pedido.providerOrderId,
        total: pedido.total,
        canceladoMotivo: pedido.canceladoMotivo,
      })
      .from(pedido)
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)))
      .for("update")
      .then((rows) => rows[0]);
    if (
      !atual
      || atual.brandId !== brandId
      || !deveAplicarStatusMarketplace(atual.status, novoStatus)
    ) {
      return [] as PersistedDomainEvent[];
    }

    if (!deveExecutarEfeitosOperacionais(atual.origemIngestao as "tempo_real" | "historico")) {
      await tx
        .update(pedido)
        .set({ status: novoStatus, updatedAt: new Date() })
        .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)));
      return [] as PersistedDomainEvent[];
    }

    await tx
      .update(pedido)
      .set({ status: novoStatus, updatedAt: new Date() })
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)));

    const eventos: PersistedDomainEvent[] = [];
    const statusPagos = ["pago", "separado", "enviado", "entregue", "concluido"];
    if (statusPagos.includes(novoStatus) && !statusPagos.includes(atual.status)) {
      eventos.push(await persistirEvento({
        tipo: "pedido.pago",
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: pedidoId,
        payload: { status: "pago", statusAnterior: atual.status, origemStatus: novoStatus },
      }, tx));
    }

    const eventoPorStatus: Partial<Record<typeof novoStatus, DomainEventType>> = {
      enviado: "pedido.enviado",
      entregue: "pedido.entregue",
      concluido: "pedido.entregue",
      cancelado: "pedido.cancelado",
      devolvido: "pedido.devolvido",
    };
    const tipoEvento = eventoPorStatus[novoStatus];
    if (tipoEvento) {
      eventos.push(await persistirEvento({
        tipo: tipoEvento,
        orgId,
        brandId,
        entidade: "pedido",
        entidadeId: pedidoId,
        payload: {
          status: novoStatus,
          statusAnterior: atual.status,
          origemStatus: statusExterno,
          providerOrderId: atual.providerOrderId,
          total: atual.total,
          canceladoMotivo: novoStatus === "cancelado" ? atual.canceladoMotivo : undefined,
        },
      }, tx));
    }
    return eventos;
  });

  for (const evento of resultado) await despacharEvento(evento);
  if (resultado.length === 0) {
    // Uma repetição também atua como recuperação do outbox caso a primeira
    // publicação tenha falhado depois do commit do pedido.
    const recuperacao = await despacharEventosPendentes(orgId, 100);
    if (recuperacao.falhas > 0) {
      throw new Error(`Falha ao republicar ${recuperacao.falhas} evento(s) pendente(s) do pedido.`);
    }
  }
}
