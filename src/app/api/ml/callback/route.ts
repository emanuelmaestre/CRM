import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandEnvSuffix, getBrandConfig, isBrandSlug, type BrandSlug } from "@/shared/config/brands";

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
    .eq("tipo", "mercadolivre")
    .maybeSingle();

  if (selectError) return { error: selectError };

  const now = new Date().toISOString();
  const metaAtual = existente?.meta && typeof existente.meta === "object"
    ? existente.meta as Record<string, unknown>
    : {};
  const payload = {
    nome: `Mercado Livre ${getBrandConfig(input.brand)?.label ?? input.brand}`,
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
      tipo: "mercadolivre",
      vault_key: `oauth:mercadolivre:${input.brand}`,
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

  const rawBrand = state.split(":")[0];
  if (!isBrandSlug(rawBrand)) {
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=invalid_brand`);
  }
  const brand = rawBrand;

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
    // O corpo cru da resposta fica no log do servidor, onde é útil para
    // depurar — e só lá. Ecoá-lo na URL de redirect levava a resposta de um
    // endpoint de token para o histórico do navegador, os logs de acesso e o
    // cabeçalho Referer de qualquer link seguido depois. `ml_error` sozinho já
    // rende a mensagem de settings.json ("Erro ao trocar o código por token"),
    // que é o que o usuário consegue acionar; o detalhe técnico não era para
    // ele em momento nenhum.
    console.error("[ml/callback] token exchange failed", tokenRes.status, body);
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=token_exchange_failed`);
  }

  const tokens: MLTokenResponse = await tokenRes.json();

  // Isolamento de marca (PRD §Fase 4): o OAuth usa a sessão do ML aberta no
  // navegador, então conectar a WUWU logado como KARZI gravaria o token da
  // conta errada. Recusa quando o vendedor autorizado não é o da marca.
  const brandEnv = brandEnvSuffix(brand);
  const sellerEsperado = process.env[`ML_SELLER_ID_${brandEnv}`];
  if (!sellerEsperado) {
    console.warn(
      `[ml/callback] ML_SELLER_ID_${brandEnv} não configurado — ` +
      `token aceito sem validar a marca (seller ${tokens.user_id}).`
    );
  } else if (String(tokens.user_id) !== sellerEsperado) {
    console.error(
      `[ml/callback] conta errada para ${brand}: esperado ${sellerEsperado}, ` +
      `autorizado ${tokens.user_id}`
    );
    const detalhe = encodeURIComponent(
      `Você autorizou a conta ${tokens.user_id}, mas ${getBrandConfig(brand)?.label ?? brand} espera a ${sellerEsperado}. ` +
      `Saia da conta atual no Mercado Livre e entre com a conta correta.`
    );
    return NextResponse.redirect(
      `${appUrl}/configuracoes?ml_error=conta_incorreta&ml_detail=${detalhe}`
    );
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
    console.error("[ml/callback] brand resolution failed", marcaError);
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=invalid_brand`);
  }
  const brandId = marca.id;

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

  const contaResult = await sincronizarContaCanal({
    orgId,
    brandId,
    brand,
    sellerId: String(tokens.user_id),
  });
  if (contaResult.error) {
    console.error("[ml/callback] channel_account sync failed", contaResult.error);
    await supabase
      .from("canal_tokens")
      .delete()
      .eq("org_id", orgId)
      .eq("brand_id", brandId)
      .eq("canal", "mercadolivre");
    return NextResponse.redirect(`${appUrl}/configuracoes?ml_error=db_failed`);
  }

  const res = NextResponse.redirect(`${appUrl}/configuracoes?ml_connected=${brand}`);
  res.cookies.delete("ml_pkce_verifier");
  res.cookies.delete("ml_pkce_state");
  return res;
}
