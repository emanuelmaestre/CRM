/** Recuperação pontual: dry-run por padrão. Nunca publica estoque ou eventos.
 * node --env-file=.env.local --import tsx scripts/recuperar-conciliacao.mts [--apply] [--limit=20]
 */
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { isBrandSlug } from "../src/shared/config/brands";
import { criarMLProvider } from "../src/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "../src/modules/canais/infrastructure/shopee.provider";
import { criarTikTokShopProvider } from "../src/modules/canais/infrastructure/tiktokshop.provider";
import { ingerirPedido } from "../src/modules/canais/application/ingestao-pedido.service";
import { buscarPedidoComRegistro } from "../src/modules/canais/application/recepcao-pedido.service";
import type { PedidoNormalizado } from "../src/modules/canais/domain/ports";

const aplicar = process.argv.includes("--apply");
const limite = Number(process.argv.find((v) => v.startsWith("--limit="))?.split("=")[1] ?? 20);
if (!Number.isInteger(limite) || limite < 1 || limite > 500) throw new Error("Limite permitido: 1 a 500.");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");
type Conta = { id: string; brandId: string; marca: string; tipo: string };
const contas = await db.execute(sql`select c.id, c.brand_id as "brandId", b.slug as marca, c.tipo from channel_account c
  join brand b on b.id = c.brand_id and b.org_id = c.org_id
  where c.org_id = ${orgId} and c.encerrado_em is null and c.tipo in ('mercadolivre','shopee','tiktokshop')`) as unknown as Conta[];
const candidatos = new Map<string, { conta: Conta; pedido: string }>();
const incluir = (conta: Conta | undefined, pedido: string) => {
  if (conta && pedido) candidatos.set(`${conta.id}:${pedido}`, { conta, pedido });
};
const evidencia = JSON.parse(fs.readFileSync("docs/auditoria-conciliacao-evidencias-2026-08-30.json", "utf8")) as {
  resultados: { marca: string; faltantesDetalhe: { id: string }[] }[];
};
for (const r of evidencia.resultados) for (const p of r.faltantesDetalhe) incluir(contas.find((c) => c.marca === r.marca && c.tipo === "mercadolivre"), p.id);
const filas = await db.execute(sql`
  select q.channel_account_id as conta, q.provider_order_id as pedido from pedido_ignorado q
    where q.org_id = ${orgId} and q.resolvido_em is null and q.descartado_em is null
  union select l.channel_account_id, i.provider_record_id from import_item i
    join import_lote l on l.id = i.lote_id and l.org_id = i.org_id
    where i.org_id = ${orgId} and l.tipo = 'pedidos_historicos_mercadolivre' and i.status in ('quarentena','erro')
`);
for (const row of filas) incluir(contas.find((c) => c.id === row.conta), String(row.pedido));
const existentes = await db.execute(sql`select channel_account_id as conta, provider_order_id as pedido from pedido where org_id = ${orgId}
  union select channel_account_id, provider_order_id from pedido_ignorado where org_id = ${orgId} and descartado_em is not null`);
for (const row of existentes) candidatos.delete(`${row.conta}:${row.pedido}`);
const selecionados = [...candidatos.values()].slice(0, limite);
const resultados: Record<string, unknown>[] = [];
const arquivo = `docs/conciliacao-recuperacao-${aplicar ? "aplicada" : "previa"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
function salvar() {
  fs.writeFileSync(arquivo, JSON.stringify({ orgId, aplicar, candidatos: candidatos.size, selecionados: selecionados.length, atualizadoEm: new Date().toISOString(), resultados }, null, 2));
}
console.log(JSON.stringify({ modo: aplicar ? "recuperacao_historica" : "previa_sem_escrita", candidatos: candidatos.size, selecionados: selecionados.length }));
const providers = new Map<string, (id: string) => Promise<PedidoNormalizado>>();
for (const { conta, pedido: id } of selecionados) {
  try {
    if (!isBrandSlug(conta.marca)) throw new Error("Marca sem provider configurado.");
    const buscar = async () => {
      let fn = providers.get(conta.id);
      if (!fn) {
        const provider = conta.tipo === "mercadolivre" ? await criarMLProvider(conta.marca as Parameters<typeof criarMLProvider>[0])
          : conta.tipo === "shopee" ? await criarShopeeProvider(conta.marca as Parameters<typeof criarShopeeProvider>[0])
          : await criarTikTokShopProvider(conta.marca as Parameters<typeof criarTikTokShopProvider>[0]);
        fn = "buscarPedidoPorId" in provider ? (p) => provider.buscarPedidoPorId(p)
          : async (p) => { const [item] = await provider.buscarPedidosPorIds([p]); if (!item) throw new Error("Pedido não devolvido pelo canal."); return item; };
        providers.set(conta.id, fn);
      }
      return fn(id);
    };
    const p = aplicar ? await buscarPedidoComRegistro({ orgId, brandId: conta.brandId, channelAccountId: conta.id }, id, buscar) : await buscar();
    if (p.providerOrderId !== id || p.canal !== conta.tipo) throw new Error("Pedido devolvido não corresponde ao solicitado.");
    const resultado = aplicar ? await ingerirPedido(orgId, conta.brandId, conta.id, p, { historico: true }) : null;
    resultados.push({ marca: conta.marca, canal: conta.tipo, id, status: p.status, total: p.total,
      criadoEm: p.criadoEm, itens: p.itens.length, quantidade: p.itens.reduce((n, i) => n + i.quantidade, 0),
      semSku: p.itens.filter((i) => !i.skuExterno).length, ...resultado });
  } catch (error) {
    // O payload completo fica na fila protegida, não no relatório exportável.
    const mensagem = error instanceof Error ? error.message : String(error);
    const causa = error instanceof Error ? error.cause as { code?: string; constraint_name?: string; message?: string } | undefined : undefined;
    resultados.push({ marca: conta.marca, canal: conta.tipo, id,
      erro: mensagem.startsWith("Failed query:") ? "Falha de persistência; consultar a fila de pedidos não importados." : mensagem.slice(0, 300),
      codigo: causa?.code, restricao: causa?.constraint_name,
      detalheTecnico: causa?.message?.replace(/\([^)]+\)=\([^)]+\)/g, "(dados omitidos)").slice(0, 180),
    });
  }
  salvar();
  if (resultados.length % 20 === 0) console.log(JSON.stringify({ processados: resultados.length, falhas: resultados.filter((r) => r.erro).length }));
}
salvar();
console.log(JSON.stringify({ arquivo, processados: resultados.length, novos: resultados.filter((r) => r.novo).length, falhas: resultados.filter((r) => r.erro).length }));
await getDb().$client.end({ timeout: 10 });
