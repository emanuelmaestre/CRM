import { ProxyAgent } from "undici";

/* ── Proxy de IP fixo para a API da Shopee ────────────────────────
   A Shopee pode exigir lista branca de IP de saída — as funções serverless
   da Vercel não têm IP fixo, então as chamadas passam por um proxy HTTP
   dedicado (hoje, Fixie) que sempre sai pelos mesmos 2 IPs, cadastrados na
   lista branca do app.

   Removível quando quiser: some ou some o valor de SHOPEE_PROXY_URL no
   .env e todo fetch feito por `shopeeFetch` volta a sair direto, sem
   proxy nenhum — não precisa mexer em nenhum outro arquivo. */

let agenteProxy: ProxyAgent | null | undefined;

function obterAgenteProxy(): ProxyAgent | null {
  // Cacheia o agente (não a URL) — criar um ProxyAgent novo a cada chamada
  // abriria uma conexão nova toda vez à toa.
  if (agenteProxy !== undefined) return agenteProxy;
  const url = process.env.SHOPEE_PROXY_URL?.trim();
  agenteProxy = url ? new ProxyAgent(url) : null;
  return agenteProxy;
}

/** Mesma assinatura do fetch nativo — só acrescenta o proxy quando
 *  SHOPEE_PROXY_URL está definida. Sem a variável, é um fetch comum. */
export function shopeeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const dispatcher = obterAgenteProxy();
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as RequestInit & { dispatcher: ProxyAgent });
}
