import { NextRequest, NextResponse } from "next/server";
import { obterAppUrl } from "@/shared/config/app-url";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { createClient } from "@supabase/supabase-js";
import { getBrandConfig, isBrandSlug, type BrandSlug } from "@/shared/config/brands";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TikTokTokenResponse {
  code?: number;
  message?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    access_token_expire_in?: number;
    refresh_token_expire_in?: number;
    open_id?: string;
    seller_name?: string;
  };
}

async function sincronizarContaCanal(input: {
  orgId: string;
  brandId: string;
  brand: BrandSlug;
  sellerId: string;
}) {
  const { data: existente, error: selectError } = await supabase
    .from("channel_account")
    .select("id, meta")
    .eq("org_id", input.orgId)
    .eq("brand_id", input.brandId)
    .eq("tipo", "tiktokshop")
    .maybeSingle();

  if (selectError) return { error: selectError };

  const now = new Date().toISOString();
  const metaAtual = existente?.meta && typeof existente.meta === "object"
    ? existente.meta as Record<string, unknown>
    : {};
  const payload = {
    nome: `TikTok Shop ${getBrandConfig(input.brand)?.label ?? input.brand}`,
    status: "conectado",
    meta: { ...metaAtual, externalAccountId: input.sellerId, synthetic: false },
    ultima_verificacao: now,
    ultimo_erro: null,
    atualizado_em: now,
  };

  const result = existente
    ? await supabase.from("channel_account").update(payload).eq("id", existente.id).select("id").single()
    : await supabase.from("channel_account").insert({
      ...payload,
      org_id: input.orgId,
      brand_id: input.brandId,
      tipo: "tiktokshop",
      vault_key: `oauth:tiktokshop:${input.brand}`,
    }).select("id").single();

  if (result.error) return { error: result.error };

  await supabase.from("audit_log").insert({
    org_id: input.orgId,
    brand_id: input.brandId,
    autor_tipo: "sistema",
    entidade: "channel_account",
    entidade_id: result.data.id,
    acao: existente ? "oauth_sync" : "oauth_create",
    antes: existente ? { meta: existente.meta } : null,
    depois: { status: "conectado", externalAccountId: input.sellerId },
  });

  return { error: null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const appUrl = obterAppUrl();

  if (!code) {
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=missing_params`);
  }

  const savedState = req.cookies.get("tiktok_oauth_state")?.value;
  if (!savedState || !state || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=state_mismatch`);
  }
  const [rawBrand] = savedState.split(":");
  if (!isBrandSlug(rawBrand)) {
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=invalid_brand`);
  }
  const brand = rawBrand;

  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !appSecret) {
    console.error("[tiktok/callback] TIKTOK_APP_KEY/TIKTOK_APP_SECRET não configurados");
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=missing_credentials`);
  }

  // Mesmo proxy de IP fixo usado pela Shopee: o IP cadastrado na "Lista de
  // permissões de IP" do Partner Center do TikTok é o mesmo IP do proxy
  // Webshare (ver shopee-proxy-webshare na memória) — sem ele, a chamada sai
  // pelo IP efêmero da Vercel e o TikTok recusa.
  const tokenRes = await shopeeFetch(
    `https://auth.tiktok-shops.com/api/v2/token/get?${new URLSearchParams({
      app_key: appKey,
      app_secret: appSecret,
      auth_code: code,
      grant_type: "authorized_code",
    })}`,
    { signal: AbortSignal.timeout(10_000) },
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[tiktok/callback] token exchange failed", tokenRes.status, body);
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=token_exchange_failed`);
  }

  const tokens: TikTokTokenResponse = await tokenRes.json();
  if ((tokens.code !== undefined && tokens.code !== 0) || !tokens.data?.access_token) {
    console.error("[tiktok/callback] token exchange returned error", tokens.code, tokens.message);
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=token_exchange_failed`);
  }
  const dados = tokens.data;

  const orgId = process.env.DEFAULT_ORG_ID!;
  const { data: marca, error: marcaError } = await supabase
    .from("brand")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", brand)
    .eq("active", true)
    .maybeSingle();
  if (marcaError || !marca) {
    console.error("[tiktok/callback] brand resolution failed", marcaError);
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=invalid_brand`);
  }
  const brandId = marca.id;

  const expiresAt = new Date(Date.now() + (dados.access_token_expire_in ?? 0) * 1000).toISOString();
  const sellerId = dados.open_id ?? dados.seller_name ?? brand;

  const { error: dbError } = await supabase
    .from("canal_tokens")
    .upsert(
      {
        org_id: orgId,
        brand_id: brandId,
        canal: "tiktokshop",
        seller_id: sellerId,
        access_token: dados.access_token,
        refresh_token: dados.refresh_token ?? null,
        expires_at: expiresAt,
        scope: null,
        raw: dados as unknown as Record<string, unknown>,
      },
      { onConflict: "org_id,brand_id,canal" },
    );

  if (dbError) {
    console.error("[tiktok/callback] db upsert failed", dbError);
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=db_failed`);
  }

  const contaResult = await sincronizarContaCanal({ orgId, brandId, brand, sellerId });
  if (contaResult.error) {
    console.error("[tiktok/callback] channel_account sync failed", contaResult.error);
    await supabase
      .from("canal_tokens")
      .delete()
      .eq("org_id", orgId)
      .eq("brand_id", brandId)
      .eq("canal", "tiktokshop");
    return NextResponse.redirect(`${appUrl}/configuracoes?tiktok_error=db_failed`);
  }

  const res = NextResponse.redirect(`${appUrl}/configuracoes?tiktok_connected=${brand}`);
  res.cookies.delete("tiktok_oauth_state");
  return res;
}
