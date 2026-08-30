/** Verificação de leitura por padrão. --corrigir-taxas aplica reparos auditados.
 * Compara IDs, valores e unidades de períodos fechados após a recuperação.
 * Não confunde total de API com indicador do painel. */
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { obterTokenMercadoLivre } from "../src/modules/canais/infrastructure/mercadolivre.provider";
import { isBrandSlug } from "../src/shared/config/brands";
const corrigirTaxas = process.argv.includes("--corrigir-taxas");
const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("Organização obrigatória.");
const evidencias = JSON.parse(fs.readFileSync("docs/auditoria-conciliacao-evidencias-2026-08-30.json", "utf8")) as {
  resultados: { marca: string; inicioInclusivo: string; fimExclusivo: string }[];
};
type Ordem = { id: number; total_amount: number; date_created: string; status: string; order_items: { quantity: number; unit_price: number; sale_fee?: number; item: { seller_sku?: string } }[] };
const resultados: Record<string, unknown>[] = [];
const reparos: Record<string, unknown>[] = [];
const arquivoReparos = `docs/conciliacao-taxas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
for (const periodo of evidencias.resultados) {
  if (!isBrandSlug(periodo.marca)) throw new Error("Marca inválida.");
  const { accessToken } = await obterTokenMercadoLivre(periodo.marca);
  const get = async (path: string) => {
    const res = await fetch(`https://api.mercadolibre.com${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Mercado Livre HTTP ${res.status}`);
    return res.json();
  };
  const seller = await get("/users/me") as { id: number };
  const inicio = Date.parse(periodo.inicioInclusivo), fim = Date.parse(periodo.fimExclusivo);
  const orders = new Map<string, Ordem>();
  const dia = 86400000;
  for (let de = inicio - dia; de < fim + dia; de += 3 * dia) {
    const ate = Math.min(de + 3 * dia, fim + dia);
    let completos = false;
    const janela = new Map<string, Ordem>();
    for (let offset = 0; offset < 20000; offset += 50) {
      const qs = new URLSearchParams({ seller: String(seller.id), "order.date_created.from": new Date(de).toISOString(), "order.date_created.to": new Date(ate).toISOString(), sort: "date_asc", limit: "50", offset: String(offset) });
      const pagina = await get(`/orders/search?${qs}`) as { results: Ordem[]; paging: { total: number } };
      if (!Array.isArray(pagina.results) || !Number.isFinite(pagina.paging?.total)) throw new Error("Resposta sem paginação completa.");
      for (const o of pagina.results) janela.set(String(o.id), o);
      if (offset + pagina.results.length >= pagina.paging.total) {
        if (janela.size !== pagina.paging.total) throw new Error("Paginação instável.");
        completos = true; break;
      }
      if (!pagina.results.length) throw new Error("Página vazia prematura.");
    }
    if (!completos) throw new Error("Limite de páginas excedido.");
    for (const [id, o] of janela) if (Date.parse(o.date_created) >= inicio && Date.parse(o.date_created) < fim) orders.set(id, o);
  }
  const locais = await db.execute(sql`select p.id as interno, p.brand_id as marca, p.provider_order_id as id, p.total, p.status,
    (select sum(i.quantidade)::int from pedido_item i where i.pedido_id=p.id) as unidades,
    (select sum(i.taxa_marketplace)::text from pedido_item i where i.pedido_id=p.id) as taxas
    from pedido p join brand b on b.id=p.brand_id and b.org_id=p.org_id
    where p.org_id=${orgId} and b.slug=${periodo.marca} and p.canal='mercadolivre'
      and p.criado_em >= ${periodo.inicioInclusivo} and p.criado_em < ${periodo.fimExclusivo}`);
  const mapa = new Map(locais.map((r) => [String(r.id), r]));
  const faltantes: string[] = [], diferencas: Record<string, unknown>[] = [], taxasDivergentes: string[] = [], taxasIndisponiveis: string[] = [];
  for (const [id, o] of orders) {
    const p = mapa.get(id);
    if (!p) { faltantes.push(id); continue; }
    const unidades = o.order_items.reduce((n, i) => n + i.quantity, 0);
    if (Math.round(Number(p.total) * 100) !== Math.round(o.total_amount * 100) || p.unidades !== unidades) {
      diferencas.push({ id, totalApi: o.total_amount, totalCrm: p.total, unidadesApi: unidades, unidadesCrm: p.unidades });
    }
    if (o.order_items.every((i) => i.sale_fee != null)) {
      const taxa = o.order_items.reduce((n, i) => n + Math.round(i.sale_fee! * i.quantity * 100), 0);
      if (p.taxas == null || Math.round(Number(p.taxas) * 100) !== taxa) {
        taxasDivergentes.push(id);
        if (corrigirTaxas) {
          const reparo = await db.transaction(async (tx) => {
            await tx.execute(sql`select id from pedido where id=${p.interno} and org_id=${orgId} for update`);
            const itens = await tx.execute(sql`select i.id, i.quantidade, i.preco_unitario as preco, i.taxa_marketplace as taxa, pr.sku
              from pedido_item i join produto pr on pr.id=i.produto_id and pr.org_id=${orgId}
              where i.pedido_id=${p.interno}`);
            const usados = new Set<string>();
            const pares = o.order_items.map((origem) => {
              const candidatos = itens.filter((i) => !usados.has(String(i.id)) && i.quantidade === origem.quantity
                && Math.round(Number(i.preco) * 100) === Math.round(origem.unit_price * 100)
                && (itens.length === 1 && o.order_items.length === 1 || i.sku === origem.item.seller_sku));
              if (candidatos.length !== 1) return null;
              usados.add(String(candidatos[0].id));
              return { item: candidatos[0], depois: (Math.round(origem.sale_fee! * origem.quantity * 100) / 100).toFixed(2) };
            });
            if (pares.some((r) => !r) || usados.size !== itens.length) return { id, marca: periodo.marca, pendente: "Itens sem correspondência inequívoca; nenhuma tarifa alterada." };
            for (const par of pares) {
              await tx.execute(sql`update pedido_item set taxa_marketplace=${par!.depois} where id=${par!.item.id} and pedido_id=${p.interno}`);
            }
            const antes = itens.map((i) => ({ item: i.id, taxa: i.taxa }));
            const depois = pares.map((r) => ({ item: r!.item.id, taxa: r!.depois }));
            await tx.execute(sql`insert into audit_log (org_id,brand_id,autor_tipo,entidade,entidade_id,acao,antes,depois)
              values (${orgId},${p.marca},'sistema','pedido',${p.interno},'update',${JSON.stringify({ taxas: antes })}::jsonb,${JSON.stringify({ taxas: depois, origem: "conciliacao_tarifas_ml" })}::jsonb)`);
            await tx.execute(sql`update pedido set atualizado_em=now() where id=${p.interno} and org_id=${orgId}`);
            return { id, marca: periodo.marca, antes, depois };
          });
          reparos.push(reparo);
          fs.writeFileSync(arquivoReparos, JSON.stringify({ atualizadoEm: new Date().toISOString(), reparos }, null, 2));
          if (reparos.length % 25 === 0) console.log(JSON.stringify({ tarifasConferidas: reparos.length }));
        }
      }
    } else {
      taxasIndisponiveis.push(id);
    }
  }
  const totalApi = [...orders.values()].reduce((n, o) => n + Math.round(o.total_amount * 100), 0) / 100;
  const totalCrm = locais.reduce((n, p) => n + Math.round(Number(p.total) * 100), 0) / 100;
  const resumo = { marca: periodo.marca, inicioInclusivo: periodo.inicioInclusivo, fimExclusivo: periodo.fimExclusivo,
    api: { pedidos: orders.size, total: totalApi }, crm: { pedidos: locais.length, total: totalCrm }, faltantes,
    extras: locais.filter((p) => !orders.has(String(p.id))).map((p) => p.id), diferencas, taxasDivergentes, taxasIndisponiveis };
  resultados.push(resumo);
  console.log(JSON.stringify({ marca: periodo.marca, inicio: periodo.inicioInclusivo, api: resumo.api, crm: resumo.crm, faltantes: faltantes.length, extras: resumo.extras.length, diferencas: diferencas.length, taxasDivergentes: taxasDivergentes.length, taxasIndisponiveis: taxasIndisponiveis.length }));
  fs.writeFileSync(corrigirTaxas ? "docs/conciliacao-antes-tarifas-2026-08-30.json" : "docs/conciliacao-pos-recuperacao-2026-08-30.json", JSON.stringify({ verificadoEm: new Date().toISOString(), resultados }, null, 2));
}
await getDb().$client.end({ timeout: 10 });
