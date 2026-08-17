import { NextRequest, NextResponse } from "next/server";
import { obterUrlCallbackMercadoLivre } from "@/shared/config/app-url";
import { createHash, randomBytes } from "crypto";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { isBrandSlug } from "@/shared/config/brands";

// Gera code_verifier + code_challenge para PKCE (S256)
function gerarPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandSlug(brand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
  }

  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "ML_CLIENT_ID não configurado" }, { status: 500 });

  const redirectUri = obterUrlCallbackMercadoLivre();

  const { verifier, challenge } = gerarPkce();
  const state = `${brand}:${randomBytes(16).toString("hex")}`;

  // Armazena verifier + state em cookie httpOnly para validar no callback
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  const authUrl = `https://auth.mercadolivre.com.br/authorization?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ml_pkce_verifier", verifier, { httpOnly: true, sameSite: "lax", maxAge: 600 });
  res.cookies.set("ml_pkce_state", state,    { httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
