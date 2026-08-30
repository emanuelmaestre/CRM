import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedidoIgnorado } from "@/shared/lib/db/schema/vendas";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { brand } from "@/shared/lib/db/schema/org";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";

export type CausaPedidoIgnorado =
  | "sku_sem_produto"
  | "cliente_duplicado"
  | "payload_invalido"
  | "desconhecida";

/** Traduz o erro da ingestão numa causa que a tela sabe explicar.
 *
 *  A classificação existe porque a AÇÃO é diferente em cada caso, e só duas
 *  delas se resolvem editando no canal:
 *
 *  - `sku_sem_produto`   → o operador acerta o anúncio na Shopee/ML
 *  - `cliente_duplicado` → dado do CRM, ninguém resolve na loja
 *  - `payload_invalido`  → bug nosso, ninguém resolve na loja
 *
 *  Mostrar só a mensagem crua fazia as quatro parecerem a mesma coisa. */
export function classificarCausa(erro: unknown): CausaPedidoIgnorado {
  if (ehErroSkuSemProduto(erro)) return "sku_sem_produto";
  const texto = erro instanceof Error ? erro.message : String(erro);
  // Índices únicos de cliente: uq_cliente_org_telefone_active e irmãos. A
  // Shopee entrega telefone mascarado, então compradores diferentes colidem
  // no mesmo valor — foi o que derrubou pedidos em 25/08/2026.
  if (/uq_cliente_org_|duplicate key|insert into "cliente"/i.test(texto)) return "cliente_duplicado";
  // Zod rejeitando o pedido antes de qualquer escrita.
  if (/too_small|invalid_type|expected string|ZodError|"path"/i.test(texto)) return "payload_invalido";
  return "desconhecida";
}

/** Uma linha por pedido recusado, POR CONTA — atualizada a cada tentativa.
 *
 *  Sem o upsert, cada sincronização criaria uma linha nova para os mesmos
 *  346 pedidos. `tentativas` acumula, e `ultimaVezEm` é o que diz se aquilo
 *  ainda está acontecendo ou é resquício de um problema já resolvido. */
export async function registrarPedidoIgnorado(entrada: {
  orgId: string;
  brandId: string;
  channelAccountId: string;
  providerOrderId: string;
  causa: CausaPedidoIgnorado;
  motivo: string;
  skus: string[];
  payload: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(pedidoIgnorado).values({
      orgId: entrada.orgId,
      brandId: entrada.brandId,
      channelAccountId: entrada.channelAccountId,
      providerOrderId: entrada.providerOrderId,
      causa: entrada.causa,
      motivo: entrada.motivo.slice(0, 500),
      skus: entrada.skus.length > 0 ? entrada.skus : null,
      payload: entrada.payload,
    }).onConflictDoUpdate({
      target: [pedidoIgnorado.channelAccountId, pedidoIgnorado.providerOrderId],
      set: {
        causa: entrada.causa,
        motivo: entrada.motivo.slice(0, 500),
        skus: entrada.skus.length > 0 ? entrada.skus : null,
        payload: entrada.payload,
        tentativas: sql`${pedidoIgnorado.tentativas} + 1`,
        ultimaVezEm: new Date(),
        // Voltou a falhar: reabre. Um pedido pode ser resolvido e quebrar de
        // novo por outro motivo, e a tela precisa mostrá-lo de volta.
        resolvidoEm: null,
      },
    });
  } catch (error) {
    // Registrar a pendência NUNCA pode derrubar a ingestão: ela é observação,
    // não o trabalho. Se esta escrita falhar, o pedido segue contabilizado em
    // `ignorados` no resultado da execução, como era antes desta tabela.
    console.error(`[pedidos-ignorados] falha ao registrar ${entrada.providerOrderId}`, error);
  }
}

/** Marca como resolvido quando o pedido finalmente entra. Silencioso quando
 *  não havia pendência — é o caso normal, a esmagadora maioria dos pedidos. */
export async function marcarPedidoIgnoradoResolvido(
  orgId: string,
  channelAccountId: string,
  providerOrderId: string,
): Promise<void> {
  try {
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date() })
      .where(and(
        eq(pedidoIgnorado.orgId, orgId),
        eq(pedidoIgnorado.channelAccountId, channelAccountId),
        eq(pedidoIgnorado.providerOrderId, providerOrderId),
        isNull(pedidoIgnorado.resolvidoEm),
      ));
  } catch (error) {
    console.error(`[pedidos-ignorados] falha ao resolver ${providerOrderId}`, error);
  }
}

/* ── Tela ─────────────────────────────────────────────────────────────── */

/** Causas em que reprocessar tem chance de dar certo.
 *
 *  `payload_invalido` fica de fora porque a falha é DETERMINÍSTICA: o pedido
 *  guardado é o mesmo, o validador é o mesmo, o resultado vai ser o mesmo.
 *  Oferecer "tentar novamente" ali só gasta o tempo de quem clica — aquilo é
 *  bug do CRM e não há nada a fazer na loja. */
export const CAUSAS_REPROCESSAVEIS: readonly CausaPedidoIgnorado[] = [
  "sku_sem_produto",
  "cliente_duplicado",
  "desconhecida",
];

export type PedidoIgnoradoLinha = {
  id: string;
  providerOrderId: string;
  causa: CausaPedidoIgnorado;
  motivo: string;
  skus: string[];
  marca: string;
  marcaSlug: string;
  canal: string;
  tentativas: number;
  primeiraVezEm: Date;
  ultimaVezEm: Date;
  descartadoEm: Date | null;
  /** Do payload guardado, pra tela mostrar sem bater na API do canal.
   *
   *  O pedido recusado é gravado INTEIRO em `payload` — quando ele finalmente
   *  entra, entra completo. Expor esses campos não custa consulta nenhuma: já
   *  vinham na mesma linha, só não eram lidos. Ver o detalhe aqui é o que
   *  permite decidir sem abrir o pedido no painel do canal. */
  compradorNome: string | null;
  compradorUsuario: string | null;
  compradorTelefone: string | null;
  total: string | null;
  frete: string | null;
  desconto: string | null;
  acrescimo: string | null;
  valorLiquido: string | null;
  /** Status cru do canal (`completed`, `cancelled`…). A tradução fica na
   *  tela, junto do mapa que o resto de Vendas já usa. */
  statusCanal: string | null;
  itens: ItemPedidoIgnorado[];
  pedidoEm: string | null;
  reprocessavel: boolean;
};

export type ItemPedidoIgnorado = {
  sku: string | null;
  quantidade: number | null;
  precoUnitario: string | null;
  taxaMarketplace: string | null;
};

/** Campos monetários chegam como string ("54.90"); só os repassamos adiante,
 *  sem converter para número — arredondar aqui criaria uma segunda versão do
 *  valor, diferente da que o pedido terá quando entrar. */
function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : typeof valor === "number" ? String(valor) : null;
}

type CamposDoPayload = Pick<PedidoIgnoradoLinha,
  | "compradorNome" | "compradorUsuario" | "compradorTelefone" | "total" | "frete"
  | "desconto" | "acrescimo" | "valorLiquido" | "statusCanal" | "itens" | "pedidoEm">;

function doPayload(payload: unknown): CamposDoPayload {
  const p = (payload ?? {}) as Record<string, unknown>;
  const itensBrutos = Array.isArray(p.itens) ? p.itens : [];
  return {
    compradorNome: texto(p.clienteNome),
    compradorUsuario: texto(p.clienteExternalId),
    compradorTelefone: texto(p.clienteTelefone),
    total: texto(p.total),
    frete: texto(p.frete),
    desconto: texto(p.desconto),
    acrescimo: texto(p.acrescimo),
    valorLiquido: texto(p.valorLiquido),
    statusCanal: texto(p.status),
    itens: itensBrutos.map((bruto) => {
      const item = (bruto ?? {}) as Record<string, unknown>;
      return {
        sku: texto(item.skuExterno),
        quantidade: typeof item.quantidade === "number" ? item.quantidade : null,
        precoUnitario: texto(item.precoUnitario),
        taxaMarketplace: texto(item.taxaMarketplace),
      };
    }),
    pedidoEm: texto(p.criadoEm),
  };
}

/** A fila em aberto: nem resolvido (entrou sozinho) nem descartado (alguém
 *  desistiu). `incluirFechados` traz o histórico completo, que é o que mostra
 *  se a correção no canal está funcionando ou se a fila só está sendo
 *  esvaziada na mão. */
export async function listarPedidosIgnorados(
  ctx: { orgId: string },
  opts: { incluirFechados?: boolean } = {},
): Promise<PedidoIgnoradoLinha[]> {
  const filtros = [eq(pedidoIgnorado.orgId, ctx.orgId)];
  if (!opts.incluirFechados) {
    filtros.push(isNull(pedidoIgnorado.resolvidoEm), isNull(pedidoIgnorado.descartadoEm));
  }

  const linhas = await db
    .select({
      id: pedidoIgnorado.id,
      providerOrderId: pedidoIgnorado.providerOrderId,
      causa: pedidoIgnorado.causa,
      motivo: pedidoIgnorado.motivo,
      skus: pedidoIgnorado.skus,
      tentativas: pedidoIgnorado.tentativas,
      primeiraVezEm: pedidoIgnorado.primeiraVezEm,
      ultimaVezEm: pedidoIgnorado.ultimaVezEm,
      descartadoEm: pedidoIgnorado.descartadoEm,
      payload: pedidoIgnorado.payload,
      marca: brand.name,
      marcaSlug: brand.slug,
      canal: channelAccount.tipo,
    })
    .from(pedidoIgnorado)
    .innerJoin(brand, eq(brand.id, pedidoIgnorado.brandId))
    .innerJoin(channelAccount, eq(channelAccount.id, pedidoIgnorado.channelAccountId))
    .where(and(...filtros))
    .orderBy(desc(pedidoIgnorado.ultimaVezEm))
    .limit(500);

  return linhas.map((linha) => ({
    id: linha.id,
    providerOrderId: linha.providerOrderId,
    causa: linha.causa as CausaPedidoIgnorado,
    motivo: linha.motivo,
    skus: linha.skus ?? [],
    marca: linha.marca,
    marcaSlug: linha.marcaSlug,
    canal: linha.canal,
    tentativas: linha.tentativas,
    primeiraVezEm: linha.primeiraVezEm,
    ultimaVezEm: linha.ultimaVezEm,
    descartadoEm: linha.descartadoEm,
    reprocessavel: CAUSAS_REPROCESSAVEIS.includes(linha.causa as CausaPedidoIgnorado),
    ...doPayload(linha.payload),
  }));
}

/** Quantas pendências estão em aberto. Existe separado de
 *  `listarPedidosIgnorados` porque a tela de Vendas só precisa do número —
 *  carregar 500 linhas com payload para exibir "3" seria desperdício numa
 *  página que já faz quatro consultas. */
export async function contarPedidosIgnoradosAbertos(ctx: { orgId: string }): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
    ));
  return linha?.total ?? 0;
}

/** O payload volta do jsonb com `criadoEm` em texto; a ingestão espera Date. */
function converterPayload(payload: unknown): PedidoNormalizado | null {
  if (!payload) return null;
  const bruto = payload as PedidoNormalizado & { criadoEm: string };
  return { ...bruto, criadoEm: new Date(bruto.criadoEm) } as PedidoNormalizado;
}

/* ── Quando o que está guardado não basta ──────────────────────────────
 *
 *  O payload da fila é uma fotografia do pedido como o canal o entregou NO
 *  DIA em que ele foi recusado — e a fotografia envelhece junto com o
 *  formato. Os pedidos parados desde junho foram gravados antes de
 *  `listingId` existir em `PedidoNormalizado`, então reprocessá-los do
 *  payload só repete a busca por SKU que já falhou, mesmo com a ingestão
 *  agora sabendo casar pelo anúncio.
 *
 *  Um item sem `listingId` é o sinal: ou a foto é velha, ou o canal não sabe
 *  preencher. Rebuscar no Mercado Livre custa uma chamada e devolve o pedido
 *  no formato de hoje. Falhar aqui não é fatal — devolve null e o reprocesso
 *  segue com o payload guardado, que ainda pode entrar pelo SKU. */
function faltaOAnuncio(pedidoNormalizado: PedidoNormalizado | null): boolean {
  if (!pedidoNormalizado) return true;
  return pedidoNormalizado.itens.some((item) => !item.listingId);
}

async function rebuscarNoCanal(linha: {
  canal: string;
  brandSlug: string;
  providerOrderId: string;
}): Promise<PedidoNormalizado | null> {
  if (!isBrandSlug(linha.brandSlug)) return null;
  try {
    if (linha.canal === "mercadolivre") {
      const provider = await criarMLProvider(linha.brandSlug);
      return await provider.buscarPedidoPorId(linha.providerOrderId);
    }
    /* A Shopee entra pelo mesmo portão que a busca por janela usa: enquanto o
       app aprovado não tiver a categoria de Pedidos, `SHOPEE_PEDIDOS_LIBERADO`
       segura tudo, e insistir aqui só gastaria cota do proxy para levar 403. */
    if (linha.canal === "shopee" && SHOPEE_PEDIDOS_LIBERADO) {
      const provider = await criarShopeeProvider(linha.brandSlug);
      return await provider.buscarPedidoPorId(linha.providerOrderId);
    }
    return null;
  } catch {
    // Token vencido, pedido apagado no canal, rede fora: nada disso deve
    // impedir a tentativa com o que já temos em mãos.
    return null;
  }
}

/** Reprocessa o pedido, rebuscando no canal quando o payload guardado não
 *  carrega o anúncio da venda (ver `faltaOAnuncio`).
 *
 *  Na maioria das vezes o que muda entre uma tentativa e outra não é o
 *  pedido: é o CRM. Pedido é imutável no canal, e corrigir o SKU de um
 *  anúncio não reescreve a venda antiga, que continua carregando o SKU velho.
 *  O que destrava é o produto passar a existir com aquele SKU — foi o que
 *  aconteceu com os pedidos W613, travados porque o catálogo não criava as
 *  variações. Por isso a rebusca é exceção, não regra: só acontece quando o
 *  próprio payload denuncia que está velho.
 *
 *  O que vier da rebusca é gravado de volta no payload, inclusive quando a
 *  ingestão falha de novo: a próxima tentativa já começa do formato novo, sem
 *  pagar outra chamada à API.
 *
 *  Seguro de repetir: `ingerirPedido` é idempotente por `providerOrderId`. */
export async function reprocessarPedidoIgnorado(
  ctx: { orgId: string },
  id: string,
): Promise<{ ok: true; jaExistia: boolean } | { ok: false; motivo: string }> {
  const [linha] = await db
    .select({
      brandId: pedidoIgnorado.brandId,
      channelAccountId: pedidoIgnorado.channelAccountId,
      providerOrderId: pedidoIgnorado.providerOrderId,
      skus: pedidoIgnorado.skus,
      payload: pedidoIgnorado.payload,
      brandSlug: brand.slug,
      canal: channelAccount.tipo,
    })
    .from(pedidoIgnorado)
    .innerJoin(brand, eq(brand.id, pedidoIgnorado.brandId))
    .innerJoin(channelAccount, eq(channelAccount.id, pedidoIgnorado.channelAccountId))
    .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)))
    .limit(1);

  if (!linha) return { ok: false, motivo: "Pendência não encontrada." };

  const guardado = converterPayload(linha.payload);
  const rebuscado = faltaOAnuncio(guardado) ? await rebuscarNoCanal(linha) : null;
  const pedidoNormalizado = rebuscado ?? guardado;
  if (!pedidoNormalizado) {
    // Linha antiga, gravada antes de o payload passar a ser guardado, e o
    // canal não devolveu o pedido agora.
    return { ok: false, motivo: "Este pedido foi registrado sem o conteúdo original; só a próxima sincronização pode trazê-lo de volta." };
  }
  // `criadoEm` é Date e a coluna é jsonb: sem o round-trip por JSON, a data
  // iria como objeto vazio e o payload voltaria pior do que estava.
  const payloadAtualizado = rebuscado
    ? (JSON.parse(JSON.stringify(rebuscado)) as Record<string, unknown>)
    : null;

  try {
    const resultado = await ingerirPedido(ctx.orgId, linha.brandId, linha.channelAccountId, pedidoNormalizado);
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date(), ...(payloadAtualizado ? { payload: payloadAtualizado } : {}) })
      .where(eq(pedidoIgnorado.id, id));
    return { ok: true, jaExistia: !resultado.novo };
  } catch (error) {
    // Falhou de novo: atualiza causa e motivo, porque o erro pode ter mudado
    // (o SKU entrou, e agora quem barra é o cliente duplicado). Mostrar o
    // motivo velho faria o operador perseguir um problema já resolvido.
    const motivo = error instanceof Error ? error.message : String(error);
    await db.update(pedidoIgnorado)
      .set({
        causa: classificarCausa(error),
        motivo: motivo.slice(0, 500),
        skus: ehErroSkuSemProduto(error) && error.skus?.length ? error.skus : linha.skus,
        tentativas: sql`${pedidoIgnorado.tentativas} + 1`,
        ultimaVezEm: new Date(),
        ...(payloadAtualizado ? { payload: payloadAtualizado } : {}),
      })
      .where(eq(pedidoIgnorado.id, id));
    return { ok: false, motivo };
  }
}

/** Quantas pendências uma única passada tenta.
 *
 *  Cada tentativa pode custar uma rebusca no canal (três chamadas à API do
 *  Mercado Livre: pedido, endereço e frete) mais a transação da ingestão.
 *  Vinte cabem folgados no tempo de uma Server Action; a fila inteira de uma
 *  vez, não — e estourar no meio deixaria metade do trabalho feito sem
 *  ninguém saber quais. Sobrando pendência, o retorno diz quantas, e clicar
 *  de novo continua de onde parou. */
export const TAMANHO_LOTE_REPROCESSO = 20;

/** Tenta a fila aberta de uma vez, da mais antiga para a mais nova.
 *
 *  Existe porque a correção que destravou a fila é sempre a mesma para todo
 *  mundo — o catálogo passou a enxergar anúncio fora do ar, a ingestão passou
 *  a casar pelo anúncio — e nada disso muda de um pedido para o outro. Com 40
 *  pendências, clicar quarenta vezes no mesmo botão não é decisão de
 *  operação: é trabalho braçal.
 *
 *  Uma a uma, em série e sem transação única: pedido que falha não derruba os
 *  outros, e cada um já sai da fila (ou atualiza a própria causa) no momento
 *  em que é tentado. */
export async function reprocessarFilaAberta(ctx: { orgId: string }): Promise<{
  tentados: number;
  resolvidos: number;
  restantes: number;
}> {
  const fila = await db
    .select({ id: pedidoIgnorado.id })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ))
    .orderBy(pedidoIgnorado.primeiraVezEm)
    .limit(TAMANHO_LOTE_REPROCESSO);

  let resolvidos = 0;
  for (const pendencia of fila) {
    const resultado = await reprocessarPedidoIgnorado(ctx, pendencia.id);
    if (resultado.ok) resolvidos += 1;
  }

  const [restantes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ));

  return { tentados: fila.length, resolvidos, restantes: restantes?.total ?? 0 };
}


/** Tira da fila o que nunca vai entrar. Não apaga: a linha continua lá, com
 *  quem descartou e quando — a proporção entre resolvido e descartado é o que
 *  diz se o processo está funcionando ou se a fila só está sendo varrida pra
 *  debaixo do tapete. Reversível por design (`descartadoEm: null`). */
export async function descartarPedidoIgnorado(
  ctx: { orgId: string; userId?: string },
  id: string,
  desfazer = false,
): Promise<void> {
  await db.update(pedidoIgnorado)
    .set({
      descartadoEm: desfazer ? null : new Date(),
      // Sem userId (sessão de serviço) a coluna fica nula — o carimbo de
      // QUANDO é o que importa pra fila; QUEM é auditoria, e não vale
      // recusar o descarte por não ter.
      descartadoPor: desfazer ? null : ctx.userId ?? null,
    })
    .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
}
