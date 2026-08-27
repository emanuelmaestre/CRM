/* Procura um SKU no catálogo da Shopee varrendo TODOS os status, não só
 * NORMAL.
 *
 * Por que existe: `listarItemIdsAtivos` (shopee.provider.ts) pede
 * `item_status: "NORMAL"` porque só interessa o que está à venda. Quando um
 * pedido antigo chega com um SKU que não bate com nenhum anúncio, a pergunta
 * é justamente a que aquele caminho não responde — o anúncio sumiu, foi
 * pausado, esgotou ou foi para o lixo? Aqui a varredura é por status, um de
 * cada vez, porque `get_item_list` aceita um único `item_status` por chamada.
 *
 * Uso (PowerShell):
 *   npm run shopee:buscar -- --sku=W613
 *   npm run shopee:buscar -- --sku=W613-BL --marca=wuwu
 *
 * Sem --marca, procura em todas as marcas que tiverem token de catálogo.
 * Requer as credenciais live no ambiente (.env + .env.local) e o proxy
 * (SHOPEE_PROXY_URL) para o IP cair na whitelist do app.
 */

import crypto from "node:crypto";
import { BRAND_SLUGS, isBrandSlug } from "../src/shared/config/brands";
import { obterShopeeAppCredenciais } from "../src/shared/config/shopee-env";
import { obterTokenShopee } from "../src/modules/canais/infrastructure/shopee.provider";
import { shopeeFetch } from "../src/shared/lib/shopee-proxy";

/** Todos os status que `get_item_list` aceita. NORMAL é o que o provider já
 *  varre; os outros quatro são exatamente o que estamos procurando. */
const STATUS = ["NORMAL", "BANNED", "UNLIST", "REVIEWING", "SELLER_DELETE", "SHOPEE_DELETE"] as const;

const HOST = "https://partner.shopeemobile.com";

function argumento(nome: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");
}

type Creds = { partnerId: string; partnerKey: string; shopId: string; accessToken: string };

function url(path: string, creds: Creds, params: Record<string, string | number> = {}): string {
  const apiPath = `/api/v2${path}`;
  const ts = Math.floor(Date.now() / 1000);
  const base = `${creds.partnerId}${apiPath}${ts}${creds.accessToken}${creds.shopId}`;
  const sign = crypto.createHmac("sha256", creds.partnerKey).update(base).digest("hex");
  const qs = new URLSearchParams({
    partner_id: creds.partnerId,
    shop_id: creds.shopId,
    access_token: creds.accessToken,
    timestamp: String(ts),
    sign,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${HOST}${apiPath}?${qs}`;
}

async function chamar<T>(endereco: string): Promise<T> {
  const res = await shopeeFetch(endereco, { signal: AbortSignal.timeout(20000) });
  const texto = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${texto.slice(0, 240)}`);
  const data = JSON.parse(texto) as { error?: string; message?: string; response?: T };
  if (data.error) throw new Error(`${data.error}: ${data.message ?? ""}`);
  return data.response as T;
}

async function itemIdsPorStatus(creds: Creds, status: string): Promise<number[]> {
  const ids: number[] = [];
  let offset = 0;
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await chamar<{ item?: Array<{ item_id: number }>; next_offset?: number; has_next_page?: boolean }>(
      url("/product/get_item_list", creds, { offset, page_size: 100, item_status: status }),
    );
    const lote = r.item ?? [];
    ids.push(...lote.map((i) => i.item_id));
    if (!r.has_next_page || lote.length === 0) break;
    offset = r.next_offset ?? offset + lote.length;
  }
  return ids;
}

type ItemBase = {
  item_id: number;
  item_name?: string;
  item_sku?: string;
  item_status?: string;
  has_model?: boolean;
  stock_info_v2?: { summary_info?: { total_available_stock?: number } };
};

async function detalhes(creds: Creds, ids: number[]): Promise<ItemBase[]> {
  const saida: ItemBase[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await chamar<{ item_list?: ItemBase[] }>(
      url("/product/get_item_base_info", creds, { item_id_list: ids.slice(i, i + 50).join(",") }),
    );
    saida.push(...(r.item_list ?? []));
  }
  return saida;
}

type Modelo = { model_id: number; model_sku?: string; stock_info_v2?: { summary_info?: { total_available_stock?: number } } };

async function modelos(creds: Creds, itemId: number): Promise<Modelo[]> {
  const r = await chamar<{ model?: Modelo[] }>(url("/product/get_model_list", creds, { item_id: itemId }));
  return r.model ?? [];
}

async function porMarca(slug: string, alvo: string): Promise<void> {
  console.log(`\n${"═".repeat(72)}\nMarca: ${slug}\n${"═".repeat(72)}`);
  const { partnerId, partnerKey } = obterShopeeAppCredenciais("catalogo");
  if (!partnerId || !partnerKey) {
    console.error("  Credenciais de catálogo ausentes (SHOPEE_PARTNER_ID_LIVE / SHOPEE_PARTNER_KEY_LIVE).");
    return;
  }
  let creds: Creds;
  try {
    const { shopId, accessToken } = await obterTokenShopee(slug as never, "catalogo");
    creds = { partnerId, partnerKey, shopId, accessToken };
  } catch (erro) {
    console.error(`  Sem token de catálogo: ${erro instanceof Error ? erro.message : String(erro)}`);
    return;
  }
  console.log(`  shop_id ${creds.shopId}`);

  const achados: Array<{ status: string; item: ItemBase; variacao?: Modelo }> = [];
  for (const status of STATUS) {
    let ids: number[];
    try {
      ids = await itemIdsPorStatus(creds, status);
    } catch (erro) {
      console.error(`  ${status.padEnd(14)} FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
      continue;
    }
    console.log(`  ${status.padEnd(14)} ${ids.length} anúncio(s)`);
    if (ids.length === 0) continue;

    const itens = await detalhes(creds, ids);
    for (const item of itens) {
      if ((item.item_sku ?? "").toUpperCase().includes(alvo)) {
        achados.push({ status, item });
        continue;
      }
      // SKU do pedido pode ser de VARIAÇÃO — não aparece em item_sku, só na
      // lista de modelos. É o caso de W613-BL / W613-CZ (mesma peça, cores
      // diferentes), que nunca apareceriam numa busca só por item_sku.
      if (!item.has_model) continue;
      try {
        for (const modelo of await modelos(creds, item.item_id)) {
          if ((modelo.model_sku ?? "").toUpperCase().includes(alvo)) {
            achados.push({ status, item, variacao: modelo });
          }
        }
      } catch { /* item isolado que não responde não derruba a varredura */ }
    }
  }

  if (achados.length === 0) {
    console.log(`\n  Nenhum anúncio com SKU contendo "${alvo}" em NENHUM status.`);
    return;
  }
  console.log(`\n  ${achados.length} achado(s) para "${alvo}":`);
  for (const { status, item, variacao } of achados) {
    const saldo = variacao
      ? variacao.stock_info_v2?.summary_info?.total_available_stock
      : item.stock_info_v2?.summary_info?.total_available_stock;
    console.log(
      `   • [${status}] item_id=${item.item_id}` +
      (variacao ? ` model_id=${variacao.model_id} model_sku=${variacao.model_sku}` : ` item_sku=${item.item_sku}`) +
      `\n     status_real=${item.item_status} estoque=${saldo ?? "?"}\n     ${item.item_name ?? ""}`,
    );
  }
}

async function principal(): Promise<void> {
  const alvo = (argumento("sku") ?? "").toUpperCase();
  if (!alvo) throw new Error("Informe --sku=XXX");
  const marca = argumento("marca");
  if (marca && !isBrandSlug(marca)) throw new Error(`Marca desconhecida: ${marca}`);

  for (const slug of marca ? [marca] : BRAND_SLUGS) {
    await porMarca(slug, alvo);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
