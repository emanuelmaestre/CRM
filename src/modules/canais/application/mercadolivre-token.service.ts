import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const ML_TOKEN_REFRESH_MARGIN_MS = 90 * 60 * 1000;
export const ML_TOKEN_REFRESH_CRON = "0 * * * *";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().default(""),
  user_id: z.number().int().positive(),
});

export interface MercadoLivreTokenRow {
  id: string;
  refresh_token: string;
  expires_at?: string | null;
  brand_id?: string;
}

export interface MercadoLivreTokenRenovado {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  sellerId: string;
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

export function tokenMercadoLivrePrecisaRenovar(
  expiresAt: string | null | undefined,
  agoraMs = Date.now(),
  margemMs = ML_TOKEN_REFRESH_MARGIN_MS,
): boolean {
  if (!expiresAt) return true;
  const expiraMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiraMs) || expiraMs <= agoraMs + margemMs;
}

export async function solicitarRenovacaoTokenMercadoLivre(
  refreshToken: string,
  opcoes: {
    request?: typeof fetch;
    agoraMs?: number;
    clientId?: string;
    clientSecret?: string;
  } = {},
): Promise<MercadoLivreTokenRenovado> {
  const request = opcoes.request ?? fetch;
  const clientId = opcoes.clientId ?? envObrigatoria("ML_CLIENT_ID");
  const clientSecret = opcoes.clientSecret ?? envObrigatoria("ML_CLIENT_SECRET");

  const resposta = await request("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
    throw new Error(`ML refresh falhou (${resposta.status}): ${detalhe}`);
  }

  const tokens = TokenResponseSchema.parse(await resposta.json());
  const agoraMs = opcoes.agoraMs ?? Date.now();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: new Date(agoraMs + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
    sellerId: String(tokens.user_id),
    raw: tokens,
  };
}

export async function listarTokensMercadoLivreParaRenovacao(opcoes: {
  orgId?: string;
  ate?: string;
} = {}): Promise<MercadoLivreTokenRow[]> {
  const ate = opcoes.ate ?? new Date(Date.now() + ML_TOKEN_REFRESH_MARGIN_MS).toISOString();
  let consulta = clienteSupabase()
    .from("canal_tokens")
    .select("id, refresh_token, expires_at, brand_id")
    .eq("canal", "mercadolivre")
    .not("refresh_token", "is", null)
    .lte("expires_at", ate);

  if (opcoes.orgId) consulta = consulta.eq("org_id", opcoes.orgId);
  const { data, error } = await consulta;
  if (error) throw new Error(`Erro ao buscar tokens ML: ${error.message}`);
  return (data ?? []) as MercadoLivreTokenRow[];
}

export async function renovarTokenMercadoLivre(row: MercadoLivreTokenRow): Promise<{
  expiresAt: string;
  sellerId: string;
}> {
  const tokens = await solicitarRenovacaoTokenMercadoLivre(row.refresh_token);
  const { data, error } = await clienteSupabase()
    .from("canal_tokens")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      scope: tokens.scope,
      seller_id: tokens.sellerId,
      raw: tokens.raw,
    })
    .eq("id", row.id)
    .eq("refresh_token", row.refresh_token)
    .select("id");

  if (error) throw new Error(`DB update do token ML falhou: ${error.message}`);
  if (data?.length !== 1) throw new Error("Atualização concorrente do token ML detectada.");
  return { expiresAt: tokens.expiresAt, sellerId: tokens.sellerId };
}
