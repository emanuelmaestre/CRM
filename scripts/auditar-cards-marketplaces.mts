/** Auditoria somente leitura. Período explícito [inicio, fim), com offset.
 * node --import tsx scripts/auditar-cards-marketplaces.mts --inicio=2026-08-07T00:00:00-03:00 --fim=2026-09-07T00:00:00-03:00 --api
 * Sem --api, compara composição local; nunca chama ingestão ou altera pedidos.
 * --captura=... apenas identifica recebimentos/atualizações posteriores; não
 * inventa um histórico de status ou valores que não foi preservado.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { PedidoNormalizado } from "../src/modules/canais/domain/ports";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [chave, ...valor] = arg.replace(/^--/, "").split("=");
  return [chave, valor.join("=") || "true"];
}));
const instante = z.string().datetime({ offset: true }).transform((s) => new Date(s));
const inicio = instante.parse(args.inicio);
const fim = instante.parse(args.fim);
const captura = args.captura ? instante.parse(args.captura) : null;
if (inicio >= fim) throw new Error("O fim deve ser posterior ao início (limite exclusivo).");
const { db } = await import("../src/shared/lib/db");
const { pedido, pedidoItem, brand, channelAccount } = await import("../src/shared/lib/db/schema");
const { composicaoResumoPedidosSql } = await import("../src/modules/vendas/infrastructure/composicao-resumo.sql");
const { reembolsoParcialPedidoSql } = await import("../src/modules/vendas/infrastructure/valor-faturamento.sql");
const { consultarResumoPedidos } = await import("../src/modules/vendas/infrastructure/pedidos.repository");
const { mapearStatusPedido } = await import("../src/modules/canais/domain/order-status");
const { reembolsoParcialInformado } = await import("../src/modules/vendas/domain/status-faturamento");
const { isBrandSlug } = await import("../src/shared/config/brands");
const orgId = z.string().uuid().parse(process.env.DEFAULT_ORG_ID);
const c = composicaoResumoPedidosSql();
const geradoEm = new Date().toISOString();
const destino = `outputs/auditoria-cards-${geradoEm.replace(/[:.]/g, "-")}`;
await mkdir(destino, { recursive: true });
const contas = await db.select({ brandId: brand.id, empresa: brand.slug, canal: channelAccount.tipo })
  .from(channelAccount).innerJoin(brand, eq(brand.id, channelAccount.brandId))
  .where(and(eq(channelAccount.orgId, orgId), eq(brand.orgId, orgId), eq(brand.active, true),
    sql`${channelAccount.tipo} in ('shopee','tiktokshop')`, sql`${channelAccount.encerradoEm} is null`));
const resultados = [];
for (const conta of contas) {
  if (!isBrandSlug(conta.empresa) || (conta.canal !== "shopee" && conta.canal !== "tiktokshop")) continue;
  const locais = await db.select({
    order_id: pedido.providerOrderId, status_crm: pedido.status, valor_crm: pedido.total,
    status_resumo: c.status,
    valor_cards: c.valorOriginal, acrescimo_crm: pedido.acrescimo,
    criado_em: pedido.createdAt, recebido_em: pedido.receivedAt, atualizado_origem_em: pedido.atualizadoOrigemEm,
    status_armazenado: sql<string | null>`${pedido.dadosOrigem}->>'status'`,
    pagamento_aprovado: sql<string | null>`${pedido.dadosOrigem}->>'pagamentoAprovado'`,
    motivo_cancelamento: sql<string | null>`${pedido.dadosOrigem}->>'motivoCancelamento'`,
    entra_total_bruto: c.bruto, entra_confirmado: c.faturavel, entra_cancelado: c.cancelado,
    entra_devolvido: c.devolvido, entra_pendente: c.pendente,
    entra_reembolso: sql`${c.faturavel} and ${reembolsoParcialPedidoSql()} > 0`,
    valor_reembolsado_crm: reembolsoParcialPedidoSql(),
    unidades: sql<number>`(select coalesce(sum(${pedidoItem.quantidade}),0) from ${pedidoItem} where ${pedidoItem.pedidoId}=${pedido.id})`,
  }).from(pedido).where(and(eq(pedido.orgId, orgId), eq(pedido.brandId, conta.brandId), eq(pedido.canal, conta.canal),
    gte(pedido.createdAt, inicio), lt(pedido.createdAt, fim)));
  let api: PedidoNormalizado[] | null = null;
  let erroApi: string | null = null;
  let posVendaConsultado = false;
  let erroPosVenda: string | null = null;
  if (args.api === "true") {
    try {
      const provider = conta.canal === "shopee"
        ? await (await import("../src/modules/canais/infrastructure/shopee.provider")).criarShopeeProvider(conta.empresa)
        : await (await import("../src/modules/canais/infrastructure/tiktokshop.provider")).criarTikTokShopProvider(conta.empresa);
      api = (await provider.buscarPedidos(inicio, { ate: fim })).filter((p) => p.criadoEm >= inicio && p.criadoEm < fim);
      if ("listarReembolsos" in provider) {
        try {
          // Pedido criado no período pode ter sido reembolsado depois dele.
          const casos = await provider.listarReembolsos(inicio, new Date());
          for (const p of api) p.dadosOrigem = { ...p.dadosOrigem, reembolsosTikTok: casos.filter((r) => r.orderId === p.providerOrderId) };
          posVendaConsultado = true;
        } catch (e) { erroPosVenda = e instanceof Error ? e.message : "Erro de pós-venda"; }
      }
    } catch (e) { erroApi = e instanceof Error ? e.message : "Erro desconhecido"; }
  }
  const porId = new Map(api?.map((p) => [p.providerOrderId, p]));
  const idsLocais = new Set(locais.map((p) => p.order_id));
  const centavos = (valor: string | number) => Math.round(Number(valor) * 100);
  const linhas = locais.map((p) => {
    const origem = p.order_id ? porId.get(p.order_id) : undefined;
    const motivos: string[] = [];
    if (api && !origem) motivos.push("ausente_na_listagem_api_do_periodo");
    if (origem && centavos(origem.total) !== centavos(p.valor_crm)) motivos.push("valor_diferente_api_crm");
    if (origem && posVendaConsultado && centavos(reembolsoParcialInformado(origem.dadosOrigem)) !== centavos(p.valor_reembolsado_crm)) motivos.push("reembolso_diferente_api_crm");
    if (origem && mapearStatusPedido(origem.status) !== p.status_crm) motivos.push("status_operacional_diferente_verificar_transicao");
    if (p.entra_pendente) motivos.push("pendente_no_bruto_fora_do_confirmado");
    if (p.entra_cancelado && p.pagamento_aprovado === "false") motivos.push("cancelado_sem_pagamento_no_bruto_e_cancelados");
    return { marketplace: conta.canal, empresa: conta.empresa, ...p,
      status_api: origem?.dadosOrigem?.status ?? origem?.status ?? null, valor_api: origem?.total ?? null,
      produtos_api: origem ? origem.itens.reduce((s, i) => s + centavos(i.precoUnitario) * i.quantidade, 0) / 100 : null,
      frete_api: origem?.frete ?? null, desconto_api: origem?.desconto ?? null,
      acrescimo_api: origem?.acrescimo ?? null, liquido_api: origem?.valorLiquido ?? null,
      reembolso_api: origem && posVendaConsultado ? reembolsoParcialInformado(origem.dadosOrigem) : null,
      recebido_apos_captura: captura ? p.recebido_em > captura : null,
      atualizado_apos_captura: captura && p.atualizado_origem_em ? p.atualizado_origem_em > captura : null,
      motivo_da_divergencia: motivos.join("; "),
    };
  });
  const ausentes = api?.filter((p) => !idsLocais.has(p.providerOrderId)).map((p) => ({
    order_id: p.providerOrderId, marketplace: conta.canal, empresa: conta.empresa,
    status_api: p.dadosOrigem?.status ?? p.status, valor_api: p.total, motivo_da_divergencia: "ausente_no_crm",
  })) ?? [];
  const resumo = await consultarResumoPedidos(orgId, { brandIds: [conta.brandId], canais: [conta.canal], inicio, fim: new Date(fim.getTime() - 1) });
  const resultado = { ...conta, apiConsultada: api !== null, erroApi, posVendaConsultado, erroPosVenda, quantidadeApi: api?.length ?? null,
    totalApi: api ? api.reduce((s,p) => s + centavos(p.total),0) / 100 : null,
    totalComparavelApi: api ? api.reduce((s,p) => s + centavos(p.total),0) / 100 : null,
    quantidadeCrm: locais.length, unidadesCrm: locais.reduce((s,p) => s + Number(p.unidades),0), resumo,
    ausentesNoCrm: ausentes.length, valoresDiferentes: linhas.filter((p) => p.motivo_da_divergencia.includes("valor_diferente")).length,
    linhas, ausentes };
  resultados.push(resultado);
  await writeFile(`${destino}/${conta.empresa}-${conta.canal}.json`, JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify({ empresa: conta.empresa, canal: conta.canal, pedidos: locais.length, bruto: resumo.totalBrutoComparavel, apiConsultada: api !== null, erroApi }));
}
await writeFile(`${destino}/resumo.json`, JSON.stringify({ geradoEm, inicio, fimExclusivo: fim, captura,
  timezone: "America/Sao_Paulo", estado: "Estado atual; captura não reconstrói valores/status históricos sem evidência preservada.",
  resultados: resultados.map(({ linhas, ausentes, ...r }) => ({ ...r, linhasAuditadas: linhas.length, idsAusentes: ausentes.map((p) => p.order_id) })),
}, null, 2));
console.log(`Auditoria: ${destino}`);
process.exit(resultados.some((r) => r.erroApi || r.erroPosVenda) ? 1 : 0);
