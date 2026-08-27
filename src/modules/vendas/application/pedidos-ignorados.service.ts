import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { pedidoIgnorado } from "@/shared/lib/db/schema/vendas";
import { channelAccount } from "@/shared/lib/db/schema/canais";
import { brand } from "@/shared/lib/db/schema/org";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
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
  /** Do payload guardado, pra tela mostrar sem bater na API do canal. */
  compradorNome: string | null;
  total: string | null;
  pedidoEm: string | null;
  reprocessavel: boolean;
};

function doPayload(payload: unknown): Pick<PedidoIgnoradoLinha, "compradorNome" | "total" | "pedidoEm"> {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    compradorNome: typeof p.clienteNome === "string" ? p.clienteNome : null,
    total: typeof p.total === "string" ? p.total : null,
    pedidoEm: typeof p.criadoEm === "string" ? p.criadoEm : null,
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

/** Reprocessa o pedido a partir do payload guardado — SEM chamar o canal.
 *
 *  O que muda entre uma tentativa e outra não é o pedido: é o CRM. Pedido é
 *  imutável no canal, e corrigir o SKU de um anúncio não reescreve a venda
 *  antiga, que continua carregando o SKU velho. O que destrava é o produto
 *  passar a existir com aquele SKU — foi o que aconteceu com os pedidos W613,
 *  travados porque o catálogo não criava as variações (ver a correção do
 *  `has_model` em shopee.provider.ts). Por isso rebuscar na API seria mais
 *  caro e não mais eficaz.
 *
 *  Seguro de repetir: `ingerirPedido` é idempotente por `providerOrderId`. */
export async function reprocessarPedidoIgnorado(
  ctx: { orgId: string },
  id: string,
): Promise<{ ok: true; jaExistia: boolean } | { ok: false; motivo: string }> {
  const [linha] = await db
    .select()
    .from(pedidoIgnorado)
    .where(and(eq(pedidoIgnorado.id, id), eq(pedidoIgnorado.orgId, ctx.orgId)))
    .limit(1);

  if (!linha) return { ok: false, motivo: "Pendência não encontrada." };
  if (!linha.payload) {
    // Linha antiga, gravada antes de o payload passar a ser guardado.
    return { ok: false, motivo: "Este pedido foi registrado sem o conteúdo original; só a próxima sincronização pode trazê-lo de volta." };
  }

  const bruto = linha.payload as unknown as PedidoNormalizado & { criadoEm: string };
  const pedidoNormalizado = { ...bruto, criadoEm: new Date(bruto.criadoEm) } as PedidoNormalizado;

  try {
    const resultado = await ingerirPedido(ctx.orgId, linha.brandId, linha.channelAccountId, pedidoNormalizado);
    await db.update(pedidoIgnorado)
      .set({ resolvidoEm: new Date() })
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
      })
      .where(eq(pedidoIgnorado.id, id));
    return { ok: false, motivo };
  }
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
