import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";

/* ── Renovação do token OAuth do TikTok Shop ─────────────────────────────
 *
 *  Mesmo desenho de A23 (Mercado Livre) e A33 (Shopee): uma função que lista
 *  no banco os tokens perto de vencer e outra que renova UM token, para o job
 *  poder colocar cada renovação em seu próprio `step.run`.
 *
 *  O que muda em relação aos outros dois é só a leitura do prazo. O TikTok não
 *  devolve duração ("expira em 4 horas"), devolve o INSTANTE de expiração em
 *  epoch de segundos — e `access_token_expire_in` tem nome de duração. Somar
 *  esse número a `Date.now()` (que é o que o callback fazia) grava validade no
 *  ano 2083: o token some em sete dias e nada no banco jamais diz que venceu,
 *  então nenhuma rotina de renovação seria acionada. Ver `expiracaoTikTokISO`.
 *
 *  A margem é de 24h porque o access token dura 7 dias — muito mais que as 4h
 *  da Shopee. Com o cron de hora em hora, isso dá 24 tentativas antes do
 *  vencimento real; renovado uma vez, `expires_at` pula sete dias à frente e a
 *  consulta volta a não achar nada para fazer. */
export const TIKTOK_TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
export const TIKTOK_TOKEN_REFRESH_CRON = "27 * * * *";

export const CANAL_TOKEN_TIKTOK = "tiktokshop";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  access_token_expire_in: z.number().int().positive(),
  refresh_token_expire_in: z.number().int().positive().optional(),
  open_id: z.string().optional(),
  seller_name: z.string().optional(),
});

const EnvelopeSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

export interface TikTokTokenRow {
  id: string;
  refresh_token: string;
  seller_id: string;
  expires_at?: string | null;
  brand_id?: string;
  canal?: string;
}

export interface TikTokTokenRenovado {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  raw: Record<string, unknown>;
}

function envObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} não configurada.`);
  return valor;
}

function clienteSupabase() {
  return createClient(
    envObrigatoria("NEXT_PUBLIC_SUPABASE_URL"),
    envObrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

/** Qualquer valor acima deste limiar é instante absoluto, não duração.
 *
 *  O access token do TikTok vale 7 dias (604.800s) e o refresh token, 1 ano
 *  (31.536.000s) — nenhuma duração real chega perto de dez anos em segundos,
 *  enquanto todo epoch de hoje passa de 1,7 bilhão. O limiar separa os dois
 *  sem precisar confiar no nome do campo, e mantém o código correto caso o
 *  TikTok passe a mandar duração de verdade um dia. */
const LIMIAR_EPOCH_SEGUNDOS = 10 * 365 * 24 * 60 * 60;

/** Converte `access_token_expire_in` do TikTok no ISO que vai para
 *  `canal_tokens.expires_at`. Ver o comentário no topo do arquivo. */
export function expiracaoTikTokISO(
  valorEmSegundos: number | undefined,
  agoraMs: number = Date.now(),
): string {
  if (!Number.isFinite(valorEmSegundos) || !valorEmSegundos || valorEmSegundos <= 0) {
    // Sem prazo declarado, vencido: assim a renovação pega o token na próxima
    // passagem em vez de tratá-lo como eterno.
    return new Date(agoraMs).toISOString();
  }
  const ms = valorEmSegundos >= LIMIAR_EPOCH_SEGUNDOS
    ? valorEmSegundos * 1000
    : agoraMs + valorEmSegundos * 1000;
  return new Date(ms).toISOString();
}

export function tokenTikTokPrecisaRenovar(
  expiresAt: string | null | undefined,
  agoraMs = Date.now(),
  margemMs = TIKTOK_TOKEN_REFRESH_MARGIN_MS,
): boolean {
  if (!expiresAt) return true;
  const expiraMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiraMs) || expiraMs <= agoraMs + margemMs;
}

/** Troca o refresh token por um par novo.
 *
 *  Sai pelo `shopeeFetch` — o mesmo proxy de IP fixo que o provider e o
 *  callback já usam — porque o TikTok também filtra por lista de IPs do app.
 *  Fetch nativo aqui sairia pelo IP efêmero da Vercel e voltaria 36009033,
 *  exatamente o erro que derrubou o A33 da Shopee em 23/08/2026.
 *
 *  A renovação não é assinada: `auth.tiktok-shops.com` recebe app_key e
 *  app_secret na query, igual à troca do auth_code no callback. */
export async function solicitarRenovacaoTokenTikTok(
  refreshToken: string,
  opcoes: {
    request?: typeof fetch;
    agoraMs?: number;
    appKey?: string;
    appSecret?: string;
  } = {},
): Promise<TikTokTokenRenovado> {
  const request = opcoes.request ?? shopeeFetch;
  const appKey = opcoes.appKey ?? envObrigatoria("TIKTOK_APP_KEY");
  const appSecret = opcoes.appSecret ?? envObrigatoria("TIKTOK_APP_SECRET");

  const resposta = await request(
    `https://auth.tiktok-shops.com/api/v2/token/refresh?${new URLSearchParams({
      app_key: appKey,
      app_secret: appSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })}`,
    { signal: AbortSignal.timeout(10_000) },
  );

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
    throw new Error(`TikTok refresh falhou (${resposta.status}): ${detalhe}`);
  }

  const envelope = EnvelopeSchema.parse(await resposta.json());
  if (envelope.code !== undefined && envelope.code !== 0) {
    throw new Error(`TikTok refresh retornou erro ${envelope.code}: ${envelope.message ?? "sem mensagem"}`);
  }

  const tokens = TokenResponseSchema.parse(envelope.data);
  const agoraMs = opcoes.agoraMs ?? Date.now();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: expiracaoTikTokISO(tokens.access_token_expire_in, agoraMs),
    raw: tokens as unknown as Record<string, unknown>,
  };
}

export async function listarTokensTikTokParaRenovacao(opcoes: {
  orgId?: string;
  ate?: string;
} = {}): Promise<TikTokTokenRow[]> {
  const ate = opcoes.ate ?? new Date(Date.now() + TIKTOK_TOKEN_REFRESH_MARGIN_MS).toISOString();
  let consulta = clienteSupabase()
    .from("canal_tokens")
    .select("id, refresh_token, seller_id, expires_at, brand_id, canal")
    .eq("canal", CANAL_TOKEN_TIKTOK)
    .not("refresh_token", "is", null)
    .lte("expires_at", ate);

  if (opcoes.orgId) consulta = consulta.eq("org_id", opcoes.orgId);
  const { data, error } = await consulta;
  if (error) throw new Error(`Erro ao buscar tokens TikTok: ${error.message}`);
  return (data ?? []) as TikTokTokenRow[];
}

export async function renovarTokenTikTok(row: TikTokTokenRow): Promise<{ expiresAt: string }> {
  const tokens = await solicitarRenovacaoTokenTikTok(row.refresh_token);
  // A condição sobre `refresh_token` é a mesma trava otimista do A33: se outra
  // execução renovou no meio do caminho, a linha já não casa e o update volta
  // vazio, em vez de sobrescrever um token mais novo por um mais velho.
  const { data, error } = await clienteSupabase()
    .from("canal_tokens")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      raw: tokens.raw,
    })
    .eq("id", row.id)
    .eq("refresh_token", row.refresh_token)
    .select("id");

  if (error) throw new Error(`DB update do token TikTok falhou: ${error.message}`);
  if (data?.length !== 1) throw new Error("Atualização concorrente do token TikTok detectada.");
  return { expiresAt: tokens.expiresAt };
}
