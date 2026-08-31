import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { isBrandSlug } from "../src/shared/config/brands";
import { criarMLProvider, normalizarPedidoMercadoLivre, obterTokenMercadoLivre } from "../src/modules/canais/infrastructure/mercadolivre.provider";
import { deveAplicarStatusMarketplace, mapearStatusPedido, type PedidoStatus } from "../src/modules/canais/domain/order-status";

type Ordem = Parameters<typeof normalizarPedidoMercadoLivre>[0];
type Local = { interno: string; id: string; total: string; status: PedidoStatus; criado: string; unidades: number; produtos: string; taxas: string | null };
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");
const aplicar = process.argv.includes("--apply");
const argumentoInicio = process.argv.find((valor) => valor.startsWith("--desde="))?.slice(8);
const argumentoMarca = process.argv.find((valor) => valor.startsWith("--marca="))?.slice(8);
const caminhoEvidencia = process.argv.find((valor) => valor.startsWith("--evidencia="))?.slice(12);
const evidencia = caminhoEvidencia ? JSON.parse(fs.readFileSync(caminhoEvidencia, "utf8")) as {
  resultados: Array<{ marca: string; faltantes: string[]; diferencas: Array<{ id: string }> }>;
} : null;
const corte = new Date();
const dia = 86_400_000;
const centavos = (valor: string | number) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error("Valor monetário inválido.");
  return Math.round(numero * 100);
};
const excluido = (status: PedidoStatus) => status === "cancelado" || status === "devolvido";
const resultados: Record<string, unknown>[] = [];
const arquivo = `docs/conciliacao-historico-ml-${aplicar ? "aplicada" : "previa"}-${corte.toISOString().replace(/[:.]/g, "-")}.json`;
const salvar = () => fs.writeFileSync(arquivo, JSON.stringify({ inicioAuditoria: corte, atualizadoEm: new Date(), aplicar, resultados }, null, 2));
const contas = await db.execute(sql`select c.id, c.brand_id as "brandId", b.slug,
  min(p.criado_em) as primeiro from channel_account c join brand b on b.id=c.brand_id and b.org_id=c.org_id
  left join pedido p on p.channel_account_id=c.id and p.org_id=c.org_id
  where c.org_id=${orgId} and c.tipo='mercadolivre' and c.encerrado_em is null and b.active
  group by c.id,b.slug order by b.slug`);

try {
  for (const conta of contas) {
    const marca = String(conta.slug);
    if (argumentoMarca && marca !== argumentoMarca) continue;
    if (!isBrandSlug(marca)) throw new Error("Marca inválida.");
    const inicio = argumentoInicio ? new Date(argumentoInicio) : new Date(String(conta.primeiro));
    if (!Number.isFinite(inicio.getTime()) || inicio >= corte) throw new Error("Início inválido.");
    if (!argumentoInicio) { inicio.setUTCDate(1); inicio.setUTCHours(3, 0, 0, 0); }
    const { accessToken } = await obterTokenMercadoLivre(marca);
    const get = async <Resultado,>(path: string): Promise<Resultado> => {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const resposta = await fetch(`https://api.mercadolibre.com${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000),
        });
        if (resposta.ok) return resposta.json() as Promise<Resultado>;
        if (resposta.status !== 429 && resposta.status < 500) throw new Error(`ML HTTP ${resposta.status}`);
        await new Promise((resolve) => setTimeout(resolve, Math.max(1500 * (tentativa + 1), Number(resposta.headers.get("retry-after") ?? 0) * 1000)));
      }
      throw new Error("ML indisponível após três tentativas.");
    };
    const vendedor = await get<{ id: number }>("/users/me");
    const ordens = new Map<string, Ordem>();
    if (evidencia) {
      const anterior = evidencia.resultados.find((resultado) => resultado.marca === marca);
      const ids = new Set([...(anterior?.faltantes ?? []), ...(anterior?.diferencas.map((item) => item.id) ?? [])]);
      for (const id of ids) {
        const ordem = await get<Ordem>(`/orders/${encodeURIComponent(id)}`);
        if (String(ordem.id) !== id) throw new Error("ID da origem difere do solicitado.");
        ordens.set(id, ordem);
      }
    }
    for (let janela = inicio.getTime(); !evidencia && janela < corte.getTime(); janela += 7 * dia) {
      const fim = Math.min(janela + 7 * dia, corte.getTime());
      const unicos = new Map<string, Ordem>();
      let completo = false;
      for (let offset = 0; offset < 20000; offset += 50) {
        const parametros = new URLSearchParams({ seller: String(vendedor.id), sort: "date_asc", limit: "50", offset: String(offset),
          "order.date_created.from": new Date(janela - dia).toISOString(),
          "order.date_created.to": new Date(Math.min(fim + dia, corte.getTime())).toISOString() });
        const pagina = await get<{ results: Ordem[]; paging: { total: number } }>(`/orders/search?${parametros}`);
        if (!Array.isArray(pagina.results) || !Number.isInteger(pagina.paging?.total)) throw new Error("ML sem paginação válida.");
        for (const ordem of pagina.results) unicos.set(String(ordem.id), ordem);
        if (offset + pagina.results.length >= pagina.paging.total) {
          if (unicos.size !== pagina.paging.total) throw new Error("Paginação instável; nenhuma correção nesta conta.");
          completo = true;
          break;
        }
        if (!pagina.results.length) throw new Error("Página vazia prematura.");
      }
      if (!completo) throw new Error("Limite de paginação excedido.");
      for (const [id, ordem] of unicos) {
        const criada = Date.parse(ordem.date_created);
        if (criada >= inicio.getTime() && criada < corte.getTime()) ordens.set(id, ordem);
      }
      console.log(JSON.stringify({ marca, ate: new Date(fim).toISOString(), pedidosLidos: ordens.size }));
    }

    const locais = await db.execute(sql`select p.id as interno,p.provider_order_id as id,p.total,p.status,p.criado_em as criado,
      coalesce(sum(i.quantidade),0)::int as unidades,coalesce(sum(i.preco_unitario*i.quantidade),0)::text as produtos,
      sum(i.taxa_marketplace)::text as taxas from pedido p left join pedido_item i on i.pedido_id=p.id
      where p.org_id=${orgId} and p.channel_account_id=${conta.id}
      group by p.id`) as unknown as Local[];
    const porId = new Map(locais.map((local) => [local.id, local]));
    const faltantes: string[] = [];
    const diferencas: Record<string, unknown>[] = [];
    const reparar: string[] = [];
    for (const [id, ordem] of ordens) {
      const local = porId.get(id);
      if (!local) { faltantes.push(id); reparar.push(id); continue; }
      const unidades = ordem.order_items.reduce((soma, item) => soma + item.quantity, 0);
      const produtos = ordem.order_items.reduce((soma, item) => soma + centavos(item.unit_price) * item.quantity, 0);
      const taxas = ordem.order_items.every((item) => item.sale_fee != null)
        ? ordem.order_items.reduce((soma, item) => soma + centavos(item.sale_fee!) * item.quantity, 0) : null;
      const status = mapearStatusPedido(ordem.status);
      const motivos = [
        ...(centavos(local.total) !== centavos(ordem.total_amount) ? ["total"] : []),
        ...(local.unidades !== unidades || centavos(local.produtos) !== produtos ? ["itens"] : []),
        ...(taxas != null && (local.taxas == null || centavos(local.taxas) !== taxas) ? ["taxas"] : []),
        ...(Date.parse(local.criado) !== Date.parse(ordem.date_created) ? ["data"] : []),
        ...(excluido(local.status) !== excluido(status) || deveAplicarStatusMarketplace(local.status, status) ? ["status"] : []),
      ];
      if (motivos.length) {
        diferencas.push({ id, motivos, crm: local, api: { total: ordem.total_amount, status: ordem.status, unidades, produtos: produtos / 100, taxas: taxas == null ? null : taxas / 100, criado: ordem.date_created } });
        reparar.push(id);
      }
    }
    const recorte = locais.filter((local) => evidencia ? ordens.has(local.id) : Date.parse(local.criado) >= inicio.getTime() && Date.parse(local.criado) < corte.getTime());
    const totalApi = [...ordens.values()].reduce((soma, ordem) => soma + (excluido(mapearStatusPedido(ordem.status)) ? 0 : centavos(ordem.total_amount)), 0);
    const totalCrm = recorte.reduce((soma, local) => soma + (excluido(local.status) ? 0 : centavos(local.total)), 0);
    const resultado = { marca, escopo: evidencia ? "ids_divergentes_reconsultados" : "historico_completo", inicio, fimExclusivo: corte, api: { pedidos: ordens.size, faturamento: totalApi / 100 },
      crm: { pedidos: recorte.length, faturamento: totalCrm / 100 }, faltantes, diferencas,
      extras: recorte.filter((local) => !ordens.has(local.id)).map((local) => local.id), reparos: [] as Record<string, unknown>[] };
    resultados.push(resultado);
    salvar();
    console.log(JSON.stringify({ marca, api: resultado.api, crm: resultado.crm, faltantes: faltantes.length, diferencas: diferencas.length, extras: resultado.extras.length, arquivo }));
    if (aplicar) {
      const { ingerirPedido } = await import("../src/modules/canais/application/ingestao-pedido.service");
      const provider = await criarMLProvider(marca);
      for (const id of reparar) {
        const pedido = porId.has(id) ? normalizarPedidoMercadoLivre(await get<Ordem>(`/orders/${encodeURIComponent(id)}`)) : await provider.buscarPedidoPorId(id);
        if (pedido.providerOrderId !== id) throw new Error("ID da origem difere do solicitado.");
        const antes = porId.get(id) ?? null;
        const aplicado = await ingerirPedido(orgId, String(conta.brandId), String(conta.id), pedido, { historico: true });
        const depois = await db.execute(sql`select status,total,criado_em,atualizado_origem_em from pedido where org_id=${orgId} and id=${aplicado.pedidoId}`);
        await db.execute(sql`insert into audit_log(org_id,brand_id,autor_tipo,entidade,entidade_id,acao,antes,depois)
          values(${orgId},${conta.brandId},'sistema','pedido',${aplicado.pedidoId},'update',${JSON.stringify(antes)}::jsonb,
          ${JSON.stringify({ origem: "auditoria_historica_ml", depois: depois[0] })}::jsonb)`);
        resultado.reparos.push({ id, ...aplicado, antes, depois: depois[0] });
        salvar();
      }
    }
  }
} finally {
  salvar();
  await getDb().$client.end({ timeout: 10 });
}
