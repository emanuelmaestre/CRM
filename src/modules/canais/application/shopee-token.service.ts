import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { obterShopeeBaseUrl } from "@/shared/config/shopee-env";

// Token da Shopee dura bem menos que o do ML (expire_in típico é 4h, contra
// ~6h do ML) — cron mais frequente (15 em 15 min, igual ao A18) e margem
// generosa evitam qualquer corrida com a expiração real.
export const SHOPEE_TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;
export const SHOPEE_TOKEN_REFRESH_CRON = "*/15 * * * *";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expire_in: z.number().int().positive(),
  shop_id: z.number().int().positive().optional(),
});

export interface ShopeeTokenRow {
  id: string;
  refresh_token: string;
  seller_id: string;
  expires_at?: string | null;
  brand_id?: string;
}

export interface ShopeeTokenRenovado {
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

export function tokenShopeePrecisaRenovar(
  expiresAt: string | null | undefined,
  agoraMs = Date.now(),
  margemMs = SHOPEE_TOKEN_REFRESH_MARGIN_MS,
): boolean {
  if (!expiresAt) return true;
  const expiraMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiraMs) || expiraMs <= agoraMs + margemMs;
}

// Mesmo esquema de assinatura do auth/token/get (connect/callback): só
// partner_id + path + timestamp, sem access_token/shop_id — a Shopee não
// exige um token válido pra pedir a renovação dele.
function assinar(partnerId: string, partnerKey: string, path: string, timestamp: number): string {
  const base = `${partnerId}${path}${timestamp}`;
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export async function solicitarRenovacaoTokenShopee(
  refreshToken: string,
  shopId: string,
  opcoes: {
    request?: typeof fetch;
    agoraMs?: number;
    partnerId?: string;
    partnerKey?: string;
  } = {},
): Promise<ShopeeTokenRenovado> {
  const request = opcoes.request ?? fetch;
  const partnerId = opcoes.partnerId ?? envObrigatoria(`SHOPEE_PARTNER_ID_${process.env.SHOPEE_ENV?.trim().toLowerCase() === "test" ? "TEST" : "LIVE"}`);
  const partnerKey = opcoes.partnerKey ?? envObrigatoria(`SHOPEE_PARTNER_KEY_${process.env.SHOPEE_ENV?.trim().toLowerCase() === "test" ? "TEST" : "LIVE"}`);

  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor((opcoes.agoraMs ?? Date.now()) / 1000);
  const sign = assinar(partnerId, partnerKey, path, timestamp);

  const resposta = await request(
    `${obterShopeeBaseUrl()}${path}?${new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), sign })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, partner_id: Number(partnerId), shop_id: Number(shopId) }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
    throw new Error(`Shopee refresh falhou (${resposta.status}): ${detalhe}`);
  }

  const body = await resposta.json();
  if (body?.error) {
    throw new Error(`Shopee refresh retornou erro: ${body.message ?? body.error}`);
  }

  const tokens = TokenResponseSchema.parse(body);
  const agoraMs = opcoes.agoraMs ?? Date.now();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(agoraMs + tokens.expire_in * 1000).toISOString(),
    raw: tokens,
  };
}

export async function listarTokensShopeeParaRenovacao(opcoes: {
  orgId?: string;
  ate?: string;
} = {}): Promise<ShopeeTokenRow[]> {
  const ate = opcoes.ate ?? new Date(Date.now() + SHOPEE_TOKEN_REFRESH_MARGIN_MS).toISOString();
  let consulta = clienteSupabase()
    .from("canal_tokens")
    .select("id, refresh_token, seller_id, expires_at, brand_id")
    .eq("canal", "shopee")
    .not("refresh_token", "is", null)
    .lte("expires_at", ate);

  if (opcoes.orgId) consulta = consulta.eq("org_id", opcoes.orgId);
  const { data, error } = await consulta;
  if (error) throw new Error(`Erro ao buscar tokens Shopee: ${error.message}`);
  return (data ?? []) as ShopeeTokenRow[];
}

export async function renovarTokenShopee(row: ShopeeTokenRow): Promise<{ expiresAt: string }> {
  const tokens = await solicitarRenovacaoTokenShopee(row.refresh_token, row.seller_id);
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

  if (error) throw new Error(`DB update do token Shopee falhou: ${error.message}`);
  if (data?.length !== 1) throw new Error("Atualização concorrente do token Shopee detectada.");
  return { expiresAt: tokens.expiresAt };
}
