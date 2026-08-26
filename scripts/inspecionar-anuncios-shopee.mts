/* Inspeciona a API de Product Ads da Shopee contra a conta REAL.
 *
 * Por que existe: todo o provider de Ads da Shopee foi escrito a partir da
 * documentação pública, não de chamadas reais — e este projeto já se queimou
 * com isso uma vez (o provider de Ads do Mercado Livre nasceu de busca na web
 * e boa parte dos paths/campos estava errada; ver o comentário no topo de
 * mercadolivre-ads.provider.ts). Este script imprime a resposta CRUA de cada
 * endpoint pra conferir nome de campo, formato de data e limites antes de
 * confiar em qualquer número na tela.
 *
 * Uso (PowerShell):
 *   npm run anuncios:shopee:inspecionar -- --marca=armarinhos_lima
 *   npm run anuncios:shopee:inspecionar -- --marca=wuwu --dias=7
 *
 * Requisitos: o app "Elisa Lima Anuncios" já autorizado pra essa marca em
 * /configuracoes (canal_tokens.canal = "shopee_anuncios") e as credenciais
 * SHOPEE_PARTNER_ID_ANUNCIOS_* / SHOPEE_PARTNER_KEY_ANUNCIOS_* no ambiente.
 * O IP de saída precisa ser um dos declarados na whitelist do app — o proxy
 * (SHOPEE_PROXY_URL) já cuida disso.
 */

import { isBrandSlug } from "../src/shared/config/brands";
import {
  criarShopeeAdsProvider,
  paraDataShopeeAds,
} from "../src/modules/anuncios/infrastructure/shopee-ads.provider";

function argumento(nome: string): string | undefined {
  const encontrado = process.argv.find((valor) => valor.startsWith(`--${nome}=`));
  return encontrado?.split("=").slice(1).join("=");
}

function titulo(texto: string): void {
  console.log(`\n${"─".repeat(70)}\n${texto}\n${"─".repeat(70)}`);
}

function imprimir(rotulo: string, valor: unknown): void {
  console.log(`${rotulo}:`);
  console.log(JSON.stringify(valor, null, 2));
}

async function tentar<T>(rotulo: string, executar: () => Promise<T>): Promise<T | null> {
  try {
    const resultado = await executar();
    imprimir(`${rotulo} — OK`, resultado);
    return resultado;
  } catch (erro) {
    // Falhar aqui é informação, não acidente: é exatamente o que o script
    // veio descobrir. Segue pro próximo endpoint.
    console.error(`${rotulo} — FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
    return null;
  }
}

async function principal(): Promise<void> {
  const marca = argumento("marca") ?? "armarinhos_lima";
  const dias = Number(argumento("dias") ?? 7);

  if (!isBrandSlug(marca)) {
    throw new Error(`Marca desconhecida: ${marca}`);
  }

  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (dias - 1));

  titulo(`Shopee Product Ads — marca ${marca}, ${paraDataShopeeAds(inicio)} a ${paraDataShopeeAds(fim)}`);

  const provider = await criarShopeeAdsProvider(marca);

  // 1. Teste de fumaça: se o saldo responde, partner_id/partner_key/token e
  //    assinatura estão todos certos, e o que falhar depois é de contrato.
  await tentar("get_total_balance", () => provider.obterSaldo());

  // 2. Lista de campanhas — confirma paginação e o nome de `campaign_id`.
  const campanhas = await tentar("get_product_level_campaign_id_list", () => provider.listarCampanhas());

  const ids = (campanhas ?? []).map((campanha) => campanha.campaignId).slice(0, 5);
  if (ids.length === 0) {
    console.log("\nNenhuma campanha na conta — os endpoints seguintes não têm o que consultar.");
  } else {
    console.log(`\nUsando as ${ids.length} primeiras campanhas: ${ids.join(", ")}`);

    // 3. Configuração — o suspeito nº 1 é o formato de `campaign_id_list`
    //    (vírgula vs. JSON) e a existência de `item_id_list`.
    await tentar("get_product_level_campaign_setting_info", () => provider.obterConfiguracoes(ids));

    // 4. Desempenho diário — o suspeito nº 2 é o formato de data (DD-MM-YYYY)
    //    e o nome real das métricas.
    await tentar("get_product_campaign_daily_performance", () => provider.listarDesempenhoDiario(ids, inicio, fim));
  }

  // 5. Desempenho da loja — serve de conferência: a soma das campanhas tem
  //    que bater com estes números.
  await tentar("get_all_cpc_ads_daily_performance", () => provider.listarDesempenhoLoja(inicio, fim));

  titulo("Fim. Compare os campos acima com shopee-ads.provider.ts (marcas VERIFICAR).");
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
