import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { obterAppUrl } from "@/shared/config/app-url";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { obterShopeeBaseUrl, obterShopeeAppCredenciais } from "@/shared/config/shopee-env";
import { createClient } from "@supabase/supabase-js";
import { getBrandConfig, isBrandSlug, type BrandSlug } from "@/shared/config/brands";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ShopeeTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  shop_id?: number;
  error?: string;
  message?: string;
}

function assinar(partnerId: string, partnerKey: string, path: string, timestamp: number): string {
  const base = `${partnerId}${path}${timestamp}`;
  return createHmac("sha256", partnerKey).update(base).digest("hex");
}

async function sincronizarContaCanal(input: {
  orgId: string;
  brandId: string;
  brand: BrandSlug;
  shopId: string;
}) {
  const { data: existente, error: selectError } = await supabase
    .from("channel_account")
    .select("id, meta")
    .eq("org_id", input.orgId)
    .eq("brand_id", input.brandId)
    .eq("tipo", "shopee")
    .maybeSingle();

  if (selectError) return { error: selectError };

  const now = new Date().toISOString();
  const metaAtual = existente?.meta && typeof existente.meta === "object"
    ? existente.meta as Record<string, unknown>
    : {};
  const payload = {
    nome: `Shopee ${getBrandConfig(input.brand)?.label ?? input.brand}`,
    status: "conectado",
    meta: { ...metaAtual, externalAccountId: input.shopId, synthetic: false },
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
      tipo: "shopee",
      vault_key: `oauth:shopee:${input.brand}`,
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
    depois: { status: "conectado", externalAccountId: input.shopId },
  });

  return { error: null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");

  const appUrl = obterAppUrl();

  if (!code || !shopId) {
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=missing_params`);
  }

  const savedState = req.cookies.get("shopee_oauth_state")?.value;
  if (!savedState) {
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=state_mismatch`);
  }
  const [rawBrand, rawApp] = savedState.split(":");
  if (!isBrandSlug(rawBrand)) {
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=invalid_brand`);
  }
  const brand = rawBrand;
  const app: "catalogo" | "pedidos" = rawApp === "pedidos" ? "pedidos" : "catalogo";
  const canal = app === "pedidos" ? "shopee_pedidos" : "shopee";

  const { partnerId, partnerKey } = obterShopeeAppCredenciais(app);
  if (!partnerId || !partnerKey) {
    console.error(`[shopee/callback] credenciais Shopee (${app}) não configuradas`);
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=missing_credentials`);
  }

  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = assinar(partnerId, partnerKey, path, timestamp);

  const tokenRes = await shopeeFetch(
    `${obterShopeeBaseUrl()}${path}?${new URLSearchParams({
      partner_id: partnerId,
      timestamp: String(timestamp),
      sign,
    })}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId) }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    // Mesmo cuidado do callback do ML: o corpo cru só vai pro log do
    // servidor, nunca pra URL de redirect (não vira histórico de navegador
    // nem Referer de link nenhum).
    console.error("[shopee/callback] token exchange failed", tokenRes.status, body);
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=token_exchange_failed`);
  }

  const tokens: ShopeeTokenResponse = await tokenRes.json();
  if (tokens.error || !tokens.access_token) {
    console.error("[shopee/callback] token exchange returned error", tokens.error, tokens.message);
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=token_exchange_failed`);
  }

  const orgId = process.env.DEFAULT_ORG_ID!;
  const { data: marca, error: marcaError } = await supabase
    .from("brand")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", brand)
    .eq("active", true)
    .maybeSingle();
  if (marcaError || !marca) {
    console.error("[shopee/callback] brand resolution failed", marcaError);
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=invalid_brand`);
  }
  const brandId = marca.id;

  const expiresAt = new Date(Date.now() + (tokens.expire_in ?? 0) * 1000).toISOString();

  const { error: dbError } = await supabase
    .from("canal_tokens")
    .upsert(
      {
        org_id: orgId,
        brand_id: brandId,
        canal,
        seller_id: String(tokens.shop_id ?? shopId),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        scope: null,
        raw: tokens as unknown as Record<string, unknown>,
      },
      { onConflict: "org_id,brand_id,canal" },
    );

  if (dbError) {
    console.error("[shopee/callback] db upsert failed", dbError);
    return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=db_failed`);
  }

  // channel_account (status "conectado" exibido em Configurações) representa
  // o canal Shopee da marca como um todo — só o app catálogo (CRM) atualiza
  // esse status hoje; Pedidos é a segunda autorização da mesma loja, o token
  // já foi salvo acima independente disso.
  if (app === "catalogo") {
    const contaResult = await sincronizarContaCanal({
      orgId,
      brandId,
      brand,
      shopId: String(tokens.shop_id ?? shopId),
    });
    if (contaResult.error) {
      console.error("[shopee/callback] channel_account sync failed", contaResult.error);
      await supabase
        .from("canal_tokens")
        .delete()
        .eq("org_id", orgId)
        .eq("brand_id", brandId)
        .eq("canal", canal);
      return NextResponse.redirect(`${appUrl}/configuracoes?shopee_error=db_failed`);
    }
  }

  const res = NextResponse.redirect(`${appUrl}/configuracoes?shopee_connected=${brand}${app === "pedidos" ? "_pedidos" : ""}`);
  res.cookies.delete("shopee_oauth_state");
  return res;
}
