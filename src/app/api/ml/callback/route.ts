import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MLTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://karzi-wuwu.vercel.app";

  if (error) {
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=missing_params`);
  }

  // Valida PKCE state
  const savedState    = req.cookies.get("ml_pkce_state")?.value;
  const codeVerifier  = req.cookies.get("ml_pkce_verifier")?.value;

  if (!savedState || savedState !== state || !codeVerifier) {
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=state_mismatch`);
  }

  const brand = state.split(":")[0] as "karzi" | "wuwu";
  if (brand !== "karzi" && brand !== "wuwu") {
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=invalid_brand`);
  }

  const clientId     = process.env.ML_CLIENT_ID!;
  const clientSecret = process.env.ML_CLIENT_SECRET!;
  const redirectUri  = `${appUrl}/api/ml/callback`;

  // Troca o code por tokens
  const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[ml/callback] token exchange failed", tokenRes.status, body);
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=token_exchange_failed`);
  }

  const tokens: MLTokenResponse = await tokenRes.json();

  const orgId   = process.env.DEFAULT_ORG_ID!;
  const brandId = brand === "karzi"
    ? process.env.NEXT_PUBLIC_BRAND_ID_KARZI!
    : process.env.NEXT_PUBLIC_BRAND_ID_WUWU!;

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabase
    .from("canal_tokens")
    .upsert(
      {
        org_id:        orgId,
        brand_id:      brandId,
        canal:         "mercadolivre",
        seller_id:     String(tokens.user_id),
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at:    expiresAt,
        scope:         tokens.scope,
        raw:           tokens as unknown as Record<string, unknown>,
      },
      { onConflict: "org_id,brand_id,canal" }
    );

  if (dbError) {
    console.error("[ml/callback] db upsert failed", dbError);
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=db_failed`);
  }

  const res = NextResponse.redirect(`${appUrl}/configuracoes?ml_connected=${brand}`);
  res.cookies.delete("ml_pkce_verifier");
  res.cookies.delete("ml_pkce_state");
  return res;
}
