import crypto from "node:crypto";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { isBrandSlug } from "../src/shared/config/brands";
import { obterShopeeAppCredenciais, obterShopeeBaseUrl } from "../src/shared/config/shopee-env";
import { extrairIncomePorPedido, normalizarFinanceiroShopee, obterTokenShopee } from "../src/modules/canais/infrastructure/shopee.provider";
import { shopeeFetch } from "../src/shared/lib/shopee-proxy";

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");
const aplicar = process.argv.includes("--apply");
const caminhoEvidencia = process.argv.find((valor) => valor.startsWith("--evidencia="))?.slice(12);
const evidencia = caminhoEvidencia ? JSON.parse(fs.readFileSync(caminhoEvidencia, "utf8")) as {
  resultados: Array<{ marca: string; diferencas: Array<{ id: string }> }>;
} : null;
const { partnerId, partnerKey } = obterShopeeAppCredenciais("financeiro");
if (!partnerId || !partnerKey) throw new Error("Credenciais do app Financeiro ausentes.");
const resultados: Record<string, unknown>[] = [];
const arquivo = `docs/conciliacao-financeiro-shopee-${aplicar ? "aplicada" : "previa"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const salvar = () => fs.writeFileSync(arquivo, JSON.stringify({ aplicar, atualizadoEm: new Date(), resultados }, null, 2));
const contas = await db.execute(sql`select c.id,c.brand_id as "brandId",b.slug from channel_account c
  join brand b on b.id=c.brand_id and b.org_id=c.org_id where c.org_id=${orgId} and c.tipo='shopee'
  and c.encerrado_em is null and b.active order by b.slug`);
const campos = ["total", "frete", "desconto", "acrescimo", "valorLiquido"] as const;
type Local = { interno: string; id: string; total: string; frete: string | null; desconto: string | null; acrescimo: string | null; valorLiquido: string | null; status: string; atualizado: string; dados: Record<string, unknown> | null; criado: string };
type Item = { id: string; quantidade: number; preco: string; taxa: string | null };

try {
  for (const conta of contas) {
    const marca = String(conta.slug);
    if (!isBrandSlug(marca)) throw new Error("Marca inválida.");
    const token = await obterTokenShopee(marca, "financeiro");
    const todos = await db.execute(sql`select id as interno,provider_order_id as id,total,frete,desconto,acrescimo,
      valor_liquido as "valorLiquido",status,atualizado_em as atualizado,dados_origem as dados,criado_em as criado
      from pedido where org_id=${orgId} and channel_account_id=${conta.id} order by criado_em`) as unknown as Local[];
    const ids = new Set(evidencia?.resultados.find((resultado) => resultado.marca === marca)?.diferencas.map((item) => item.id));
    const locais = evidencia ? todos.filter((local) => ids.has(local.id)) : todos;
    const resultado = { marca, pedidos: locais.length, consultados: 0, indisponiveis: [] as string[], diferencas: [] as Record<string, unknown>[], aplicados: 0, concorrentes: 0 };
    resultados.push(resultado);
    for (let inicio = 0; inicio < locais.length; inicio += 20) {
      const lote = locais.slice(inicio, inicio + 20);
      const path = "/api/v2/payment/get_escrow_detail_batch";
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = crypto.createHmac("sha256", partnerKey).update(`${partnerId}${path}${timestamp}${token.accessToken}${token.shopId}`).digest("hex");
      const parametros = new URLSearchParams({ partner_id: partnerId, shop_id: token.shopId, access_token: token.accessToken, timestamp: String(timestamp), sign });
      const resposta = await shopeeFetch(`${obterShopeeBaseUrl()}${path}?${parametros}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_sn_list: lote.map((local) => local.id) }), signal: AbortSignal.timeout(15000),
      });
      if (!resposta.ok) throw new Error(`Shopee Financeiro HTTP ${resposta.status}`);
      const corpo = await resposta.json() as { error?: string; message?: string };
      if (corpo.error) throw new Error(`Shopee Financeiro: ${corpo.error}`);
      const financeiros = extrairIncomePorPedido(corpo);
      for (const local of lote) {
        const income = financeiros.get(local.id);
        if (!income) { resultado.indisponiveis.push(local.id); continue; }
        const itens = await db.execute(sql`select id,quantidade,preco_unitario as preco,taxa_marketplace as taxa
          from pedido_item where pedido_id=${local.interno} order by id`) as unknown as Item[];
        const financeiro = normalizarFinanceiroShopee(income, itens.map((item) => ({ model_quantity_purchased: item.quantidade, model_discounted_price: Number(item.preco) })))!;
        resultado.consultados++;
        const motivos = campos.filter((campo) => financeiro[campo] !== undefined && (local[campo] == null || Math.round(Number(local[campo]) * 100) !== Math.round(Number(financeiro[campo]) * 100)));
        const taxasAntes = itens.reduce((soma, item) => soma + Math.round(Number(item.taxa ?? 0) * 100), 0);
        const taxasDepois = financeiro.taxasMarketplace.reduce((soma, taxa) => soma + Math.round(Number(taxa) * 100), 0);
        if (!motivos.length && taxasAntes === taxasDepois && itens.every((item) => item.taxa != null)) continue;
        const diferenca = { id: local.id, status: local.status, criado: local.criado, motivos, antes: Object.fromEntries(campos.map((campo) => [campo, local[campo]])), depois: financeiro, taxasAntes: taxasAntes / 100, taxasDepois: taxasDepois / 100 };
        resultado.diferencas.push(diferenca);
        if (aplicar) {
          const alterado = await db.transaction(async (tx) => {
            const [atual] = await tx.execute(sql`select atualizado_em from pedido where id=${local.interno} and org_id=${orgId} for update`);
            if (!atual || String(atual.atualizado_em) !== local.atualizado) return false;
            const dados = { ...local.dados, financeiroInformado: true, financeiroConsultadoEm: new Date().toISOString() };
            await tx.execute(sql`update pedido set total=${financeiro.total ?? local.total},frete=${financeiro.frete},
              desconto=${financeiro.desconto},acrescimo=${financeiro.acrescimo},valor_liquido=${financeiro.valorLiquido ?? local.valorLiquido},
              dados_origem=${JSON.stringify(dados)}::jsonb,atualizado_em=now() where id=${local.interno} and org_id=${orgId}`);
            for (const [indice, item] of itens.entries()) {
              await tx.execute(sql`update pedido_item set taxa_marketplace=${financeiro.taxasMarketplace[indice]} where id=${item.id} and pedido_id=${local.interno}`);
            }
            await tx.execute(sql`insert into audit_log(org_id,brand_id,autor_tipo,entidade,entidade_id,acao,antes,depois)
              values(${orgId},${conta.brandId},'sistema','pedido',${local.interno},'update',${JSON.stringify(diferenca.antes)}::jsonb,
              ${JSON.stringify({ origem: "auditoria_api_financeiro_shopee", financeiro, taxasAntes: diferenca.taxasAntes, taxasDepois: diferenca.taxasDepois })}::jsonb)`);
            return true;
          });
          if (alterado) resultado.aplicados++; else resultado.concorrentes++;
        }
      }
      salvar();
      console.log(JSON.stringify({ marca, consultados: resultado.consultados, divergentes: resultado.diferencas.length, indisponiveis: resultado.indisponiveis.length, aplicados: resultado.aplicados }));
    }
  }
} finally {
  salvar();
  await getDb().$client.end({ timeout: 10 });
}
