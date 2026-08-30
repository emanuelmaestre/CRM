import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedidoIgnorado } from "@/shared/lib/db/schema/vendas";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { brand } from "@/shared/lib/db/schema/org";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { criarShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";
import { incorporarQuarentenaPedidos } from "./quarentena-pedidos.service";

import { type CausaPedidoIgnorado } from "./registro-pedido-ignorado";
export { classificarCausa, registrarPedidoIgnorado, marcarPedidoIgnoradoResolvido, type CausaPedidoIgnorado } from "./registro-pedido-ignorado";

/* ── Tela ─────────────────────────────────────────────────────────────── */

/** Todas podem ser retentadas: a tentativa reconsulta o canal e usa o
 * normalizador atual, inclusive quando a falha original era de formato. */
export const CAUSAS_REPROCESSAVEIS: readonly CausaPedidoIgnorado[] = [
  "sku_sem_produto",
  "cliente_duplicado",
  "desconhecida",
  "payload_invalido",
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

/** O que a fila está segurando DENTRO de um recorte — a mesma marca, o mesmo
 *  canal e o mesmo período que a tela de Vendas está mostrando.
 *
 *  Existe para a conferência com o painel do canal. Pedido recusado não conta
 *  no faturamento do CRM e conta no do canal: é uma das três razões pelas
 *  quais os dois números diferem, e a única que some quando alguém age.
 *
 *  A data da venda vive dentro do payload (`criadoEm`), não em coluna: a fila
 *  guarda o pedido como o canal o entregou, e ele nunca chegou a virar linha
 *  em `pedido`. Pendência antiga sem payload fica de fora do recorte por
 *  data — sem a data não há como saber se ela pertence ao período, e chutar
 *  seria pior do que omitir. */
type TipoDeConta = typeof channelAccount.$inferSelect["tipo"];
const canaisSuportados = channelAccount.tipo;

export async function resumirPedidosIgnorados(
  ctx: { orgId: string },
  opts: { brandIds?: string[]; canais?: string[]; inicio?: Date; fim?: Date } = {},
): Promise<{ quantidade: number; valor: number }> {
  const filtros = [
    eq(pedidoIgnorado.orgId, ctx.orgId),
    isNull(pedidoIgnorado.resolvidoEm),
    isNull(pedidoIgnorado.descartadoEm),
  ];
  if (opts.brandIds?.length) filtros.push(inArray(pedidoIgnorado.brandId, opts.brandIds));
  if (opts.canais?.length) {
    // A coluna é enum: o filtro vem da tela como string livre, então o
    // estreitamento acontece aqui, no limite entre os dois mundos.
    filtros.push(inArray(canaisSuportados, opts.canais as TipoDeConta[]));
  }
  /* `toISOString()`, e não o Date: dentro de um fragmento `sql` cru o
     parâmetro vai direto para o driver, que só aceita string ou Buffer — um
     Date ali derruba a consulta inteira com "The string argument must be of
     type string". Nas colunas tipadas (`gte(pedido.createdAt, data)`) o
     drizzle converte sozinho; aqui, não. Foi assim que a tela de Vendas
     quebrou em produção em 30/08/2026, minutos depois do deploy. */
  if (opts.inicio) filtros.push(sql`(${pedidoIgnorado.payload}->>'criadoEm')::timestamptz >= ${opts.inicio.toISOString()}`);
  if (opts.fim) filtros.push(sql`(${pedidoIgnorado.payload}->>'criadoEm')::timestamptz <= ${opts.fim.toISOString()}`);

  const [linha] = await db
    .select({
      quantidade: sql<number>`count(*)::int`,
      valor: sql<string>`coalesce(sum((${pedidoIgnorado.payload}->>'total')::numeric), 0)`,
    })
    .from(pedidoIgnorado)
    .innerJoin(channelAccount, eq(channelAccount.id, pedidoIgnorado.channelAccountId))
    .where(and(...filtros));

  return { quantidade: linha?.quantidade ?? 0, valor: Number(linha?.valor ?? 0) };
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

/** Consulta sempre o estado atual: payload histórico não deve reverter ajustes. */
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
    if (linha.canal === "tiktokshop") {
      const provider = await criarTikTokShopProvider(linha.brandSlug);
      return (await provider.buscarPedidosPorIds([linha.providerOrderId]))[0] ?? null;
    }
    return null;
  } catch {
    // Sem resposta atual, a pendência continua aberta; não usa dados antigos.
    return null;
  }
}

/** Recuperação histórica idempotente, sem repetir efeitos operacionais. */
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


  await db.update(pedidoIgnorado).set({ ultimaVezEm: new Date() }).where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
  const rebuscado = await rebuscarNoCanal(linha);
  // Nunca reescreve o financeiro de hoje com o payload de semanas atrás.
  const pedidoNormalizado = rebuscado;
  if (!pedidoNormalizado) {
    const motivo = "Não foi possível consultar o estado atual no canal. A pendência foi preservada; verifique a conexão e tente novamente.";
    await db.update(pedidoIgnorado).set({ motivo, tentativas: sql`${pedidoIgnorado.tentativas} + 1` })
      .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
    return { ok: false, motivo };
  }
  // `criadoEm` é Date e a coluna é jsonb: sem o round-trip por JSON, a data
  // iria como objeto vazio e o payload voltaria pior do que estava.
  const payloadAtualizado = rebuscado
    ? (JSON.parse(JSON.stringify(rebuscado)) as Record<string, unknown>)
    : null;

  try {
    const resultado = await ingerirPedido(ctx.orgId, linha.brandId, linha.channelAccountId, pedidoNormalizado, { historico: true });
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date(), ...(payloadAtualizado ? { payload: payloadAtualizado } : {}) })
      .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)));
    return { ok: true, jaExistia: !resultado.novo };
  } catch (error) {
    // A ingestão central já registrou causa, payload e tentativa.
    const motivo = error instanceof Error ? error.message : String(error);
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
  await incorporarQuarentenaPedidos(ctx.orgId);
  const fila = await db
    .select({ id: pedidoIgnorado.id })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ))
    .orderBy(pedidoIgnorado.ultimaVezEm)
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


/** Tenta um conjunto escolhido — os pedidos de UMA etapa do roteiro.
 *
 *  Mesma mecânica de `reprocessarFilaAberta`, com a lista vindo de fora: na
 *  tela, o conserto é por SKU (ou por conflito), e é ele que a pessoa acabou
 *  de fazer no canal. Tentar a fila inteira depois de arrumar UM anúncio
 *  gastaria chamada de API com pedidos que ninguém mexeu.
 *
 *  O teto por chamada é o mesmo, e pela mesma razão: cada tentativa pode
 *  custar uma rebusca no canal, e estourar o tempo da Server Action deixaria
 *  metade do trabalho feito sem ninguém saber qual metade. `restantes` conta
 *  só os ids pedidos, não a fila toda — é o que faz o botão dizer a verdade
 *  sobre a etapa em que a pessoa está. */
export async function reprocessarPedidosIgnorados(
  ctx: { orgId: string },
  ids: string[],
): Promise<{ tentados: number; resolvidos: number; restantes: number }> {
  if (ids.length === 0) return { tentados: 0, resolvidos: 0, restantes: 0 };

  const fila = await db
    .select({ id: pedidoIgnorado.id })
    .from(pedidoIgnorado)
    .where(and(
      eq(pedidoIgnorado.orgId, ctx.orgId),
      inArray(pedidoIgnorado.id, ids),
      isNull(pedidoIgnorado.resolvidoEm),
      isNull(pedidoIgnorado.descartadoEm),
      inArray(pedidoIgnorado.causa, [...CAUSAS_REPROCESSAVEIS]),
    ))
    .orderBy(pedidoIgnorado.ultimaVezEm)
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
      inArray(pedidoIgnorado.id, ids),
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
