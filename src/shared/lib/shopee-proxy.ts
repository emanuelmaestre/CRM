import { ProxyAgent } from "undici";
import { db } from "@/shared/lib/db";
import { shopeeApiCall } from "@/shared/lib/db/schema";

/* ── Proxy de IP fixo para a API da Shopee ────────────────────────
   A Shopee pode exigir lista branca de IP de saída — as funções serverless
   da Vercel não têm IP fixo, então as chamadas passam por um proxy HTTP
   dedicado (hoje, Webshare) que sempre sai pelo mesmo IP, cadastrado na
   lista branca do app. Trocado do Fixie em 24/08/2026 depois que a cota
   grátis dele (500 requisições/mês) estourou e derrubou a integração.

   SHOPEE_PROXY_URL_BACKUP é opcional: um segundo IP fixo, também cadastrado
   na whitelist da Shopee, usado só se o primeiro falhar ao nível de conexão
   (proxy fora do ar, credencial rejeitada, cota estourada de novo). Não
   entra em jogo pra um erro de negócio vindo da própria Shopee (ex: um 403
   de verdade dela) — só quando a chamada nem chega a sair.

   Removível quando quiser: some o valor de SHOPEE_PROXY_URL no .env e todo
   fetch feito por `shopeeFetch` volta a sair direto, sem proxy nenhum —
   não precisa mexer em nenhum outro arquivo. */

let agentesProxy: ProxyAgent[] | undefined;

function obterAgentesProxy(): ProxyAgent[] {
  // Cacheia os agentes (não as URLs) — criar um ProxyAgent novo a cada
  // chamada abriria uma conexão nova toda vez à toa.
  if (agentesProxy !== undefined) return agentesProxy;
  const urls = [process.env.SHOPEE_PROXY_URL, process.env.SHOPEE_PROXY_URL_BACKUP]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  agentesProxy = urls.map((url) => new ProxyAgent(url));
  return agentesProxy;
}

// shopeeFetch é o único ponto de saída pra Shopee no sistema inteiro
// (provider, webhook, renovação de token) — registrar aqui cobre 100% do
// consumo da cota do proxy, sem precisar tocar em nenhum call site. Nunca
// atrasa nem derruba a chamada real: dispara depois, em paralelo, e engole
// o próprio erro se a gravação falhar.
function registrarChamada(input: string | URL, statusCode: number | null, ok: boolean): void {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) return;
  let caminho: string;
  try {
    const url = new URL(input);
    caminho = url.pathname; // nunca loga query string: carrega access_token/sign
  } catch {
    caminho = String(input);
  }
  db.insert(shopeeApiCall).values({ orgId, caminho, statusCode, ok }).catch((error: unknown) => {
    console.error("[shopee-proxy] falha ao registrar chamada", error);
  });
}

/** Mesma assinatura do fetch nativo — só acrescenta o proxy quando
 *  SHOPEE_PROXY_URL está definida. Sem a variável, é um fetch comum. Se
 *  SHOPEE_PROXY_URL_BACKUP também estiver definida, tenta o segundo proxy
 *  quando o primeiro falha ao nível de conexão (ver comentário acima). */
export async function shopeeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const agentes = obterAgentesProxy();
  if (agentes.length === 0) {
    const res = await fetch(input, init);
    registrarChamada(input, res.status, res.ok);
    return res;
  }

  let ultimoErro: unknown;
  for (const dispatcher of agentes) {
    try {
      const res = await fetch(input, { ...init, dispatcher } as RequestInit & { dispatcher: ProxyAgent });
      registrarChamada(input, res.status, res.ok);
      return res;
    } catch (error) {
      ultimoErro = error;
    }
  }
  registrarChamada(input, null, false);
  throw ultimoErro;
}
