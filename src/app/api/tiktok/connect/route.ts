import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { obterUrlCallbackTikTok } from "@/shared/config/app-url";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { isBrandSlug } from "@/shared/config/brands";

/* ── Autorização TikTok Shop (Partner Center, app self-built) ──────
   O App Key/Secret e a URL de redirecionamento (/api/tiktok/callback) já
   estão cadastrados no app "Elisa Lima - CRM" no Partner Center. Para um app
   self-built (não um "service" público do marketplace, que usaria
   service_id), o link de autorização é montado com o próprio app_key; o
   redirect_uri é enviado mesmo assim (precisa bater exatamente com o
   cadastrado no app). Padrão confirmado em múltiplas integrações públicas
   (echotik, keyapi, pacotes tiktokshop-php), mas ainda não exercitado ao vivo
   contra a conta da Elisa Lima — mesma ressalva que o fluxo da Shopee tinha
   antes da primeira autorização real. */

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandSlug(brand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
  }

  const appKey = process.env.TIKTOK_APP_KEY;
  if (!appKey) {
    return NextResponse.json({ error: "TIKTOK_APP_KEY não configurada." }, { status: 500 });
  }

  const state = `${brand}:${randomBytes(16).toString("hex")}`;
  const redirectUri = obterUrlCallbackTikTok();

  const params = new URLSearchParams({
    app_key: appKey,
    state,
    redirect_uri: redirectUri,
  });

  const authUrl = `https://services.tiktokshop.com/open/authorize?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("tiktok_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
