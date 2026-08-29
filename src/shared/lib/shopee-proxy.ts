import { ProxyAgent } from "undici";
import { and, eq, gte, sql } from "drizzle-orm";
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
function caminhoDaChamada(input: string | URL): string {
  try {
    return new URL(input).pathname;
  } catch {
    return String(input);
  }
}

function tamanhoCorpo(body: BodyInit | null | undefined): number {
  if (!body) return 0;
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
  return 0;
}

function tamanhoResposta(response: Response): number | null {
  const bruto = response.headers.get("content-length");
  if (!bruto) return null;
  const valor = Number(bruto);
  return Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null;
}

function registrarChamada(
  input: string | URL,
  statusCode: number | null,
  ok: boolean,
  requestBytes: number,
  responseBytes: number | null,
  durationMs: number,
): void {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) return;
  // Nunca loga query string: ela carrega access_token/sign.
  const caminho = caminhoDaChamada(input);
  db.insert(shopeeApiCall).values({
    orgId,
    caminho,
    statusCode,
    ok,
    requestBytes,
    responseBytes,
    durationMs,
  }).catch((error: unknown) => {
    console.error("[shopee-proxy] falha ao registrar chamada", error);
  });
}

const LIMITE_PRIORIZACAO_BYTES = 800 * 1024 * 1024;
const CACHE_ORCAMENTO_MS = 5 * 60_000;
let orcamentoCache: { usado: number; expiraEm: number } | null = null;

function caminhoEssencial(caminho: string): boolean {
  return caminho.includes("/auth/")
    || caminho.includes("/order/")
    || caminho.includes("get_escrow_detail");
}

/** Aos 800 MB preserva autenticação e pedidos e pausa coletas secundárias. */
async function respeitarOrcamento(input: string | URL): Promise<void> {
  const caminho = caminhoDaChamada(input);
  if (caminhoEssencial(caminho)) return;
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) return;

  const agora = Date.now();
  if (!orcamentoCache || orcamentoCache.expiraEm <= agora) {
    try {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const usado = await db
        .select({
          total: sql<number>`coalesce(sum(coalesce(${shopeeApiCall.requestBytes}, 0) + coalesce(${shopeeApiCall.responseBytes}, 0)), 0)`,
        })
        .from(shopeeApiCall)
        .where(and(eq(shopeeApiCall.orgId, orgId), gte(shopeeApiCall.criadoEm, inicioMes)))
        .then((rows) => Number(rows[0]?.total ?? 0));
      orcamentoCache = { usado, expiraEm: agora + CACHE_ORCAMENTO_MS };
    } catch {
      // Telemetria nunca derruba a operação se a migration ainda não chegou.
      return;
    }
  }

  if (orcamentoCache.usado >= LIMITE_PRIORIZACAO_BYTES) {
    throw new Error("Limite preventivo da Webshare atingido; coleta secundária adiada.");
  }
}

// Cada tentativa (proxy principal, depois backup) ganha seu próprio relógio
// de timeout — se reaproveitássemos o `init.signal` do chamador entre as
// duas, um primeiro proxy lento estouraria o abort e a segunda tentativa
// nasceria já abortada, mesmo que o backup estivesse saudável e rápido.
// AbortSignal.any combina esse timeout por tentativa com o signal do
// chamador (se houver), então um cancelamento explícito do lado de fora
// ainda propaga normalmente.
const TIMEOUT_POR_TENTATIVA_MS = 8000;

/** Mesma assinatura do fetch nativo — só acrescenta o proxy quando
 *  SHOPEE_PROXY_URL está definida. Sem a variável, é um fetch comum. Se
 *  SHOPEE_PROXY_URL_BACKUP também estiver definida, tenta o segundo proxy
 *  quando o primeiro falha ao nível de conexão (ver comentário acima). */
export async function shopeeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  await respeitarOrcamento(input);
  const inicio = performance.now();
  const requestBytes = new TextEncoder().encode(String(input)).byteLength + tamanhoCorpo(init.body);
  const agentes = obterAgentesProxy();
  if (agentes.length === 0) {
    const res = await fetch(input, init);
    registrarChamada(input, res.status, res.ok, requestBytes, tamanhoResposta(res), Math.round(performance.now() - inicio));
    return res;
  }

  let ultimoErro: unknown;
  for (const dispatcher of agentes) {
    const timeoutTentativa = AbortSignal.timeout(TIMEOUT_POR_TENTATIVA_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutTentativa]) : timeoutTentativa;
    try {
      const res = await fetch(input, { ...init, signal, dispatcher } as RequestInit & { dispatcher: ProxyAgent });
      registrarChamada(input, res.status, res.ok, requestBytes, tamanhoResposta(res), Math.round(performance.now() - inicio));
      return res;
    } catch (error) {
      ultimoErro = error;
    }
  }
  registrarChamada(input, null, false, requestBytes, null, Math.round(performance.now() - inicio));
  throw ultimoErro;
}
