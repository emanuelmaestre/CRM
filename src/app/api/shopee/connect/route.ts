import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { obterUrlCallbackShopee } from "@/shared/config/app-url";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { isBrandSlug } from "@/shared/config/brands";
import { obterShopeeBaseUrl, obterShopeeAppCredenciais } from "@/shared/config/shopee-env";

/* ── Autorização Shopee (Open Platform v2) ─────────────────────────
   Diferente do OAuth "clássico" do Mercado Livre (PKCE, client_id +
   client_secret via POST), a Shopee assina cada chamada com HMAC-SHA256:
   a base é `${partner_id}${caminho_da_api}${timestamp}`, sem access_token
   nem shop_id nesta etapa (eles ainda não existem — é exatamente o que esta
   chamada está pedindo). Mesmo partner_id/partner_key já usados em
   shopee.provider.ts, aqui só sem access_token/shop_id na assinatura.

   IMPORTANTE: este contrato segue a documentação pública e estável da
   Shopee Open Platform v2 (auth_partner + auth/token/get), mas ainda não
   foi exercitado ao vivo contra uma conta real — diferente do fluxo do
   Mercado Livre, já validado em produção. Antes de confiar 100% neste
   fluxo, complete uma autorização de teste e confira se o `code` chega
   certo no callback. */

function assinar(partnerId: string, partnerKey: string, path: string, timestamp: number): string {
  const base = `${partnerId}${path}${timestamp}`;
  return createHmac("sha256", partnerKey).update(base).digest("hex");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandSlug(brand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
  }

  // "catalogo" (app Elisa Lima CRM) por padrão; "pedidos" (app Elisa Lima
  // Pedidos) quando o botão de conectar Pedidos manda ?app=pedidos — cada um
  // é uma autorização OAuth própria na Shopee, mesmo pra mesma loja/marca.
  const appParam = req.nextUrl.searchParams.get("app");
  const app = appParam === "pedidos" ? "pedidos" : "catalogo";

  const { partnerId, partnerKey } = obterShopeeAppCredenciais(app);
  if (!partnerId || !partnerKey) {
    return NextResponse.json({ error: `Credenciais Shopee (${app}) não configuradas.` }, { status: 500 });
  }

  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = assinar(partnerId, partnerKey, path, timestamp);

  // A Shopee não tem parâmetro "state" nativo no auth_partner — marca e app
  // viajam num cookie httpOnly de curta duração, igual ao verifier do ML,
  // e são conferidos no callback antes de gravar qualquer token.
  const state = `${brand}:${app}:${randomBytes(16).toString("hex")}`;
  const redirect = obterUrlCallbackShopee();

  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign,
    redirect,
  });

  const authUrl = `${obterShopeeBaseUrl()}${path}?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("shopee_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
