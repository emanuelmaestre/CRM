import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { isBrandSlug } from "@/shared/config/brands";

/* ── Autorização TikTok Shop (Partner Center, serviço personalizado) ──
   O app "Elisa Lima - CRM" foi criado como serviço personalizado, então o
   link de autorização é montado com o service_id — não com o app_key, como
   seria num app self-built. Link confirmado em 02/09/2026 no botão "Copiar
   link de autorização" do próprio Partner Center:
   https://services.tiktokshop.com/open/authorize?service_id=...

   O redirect_uri NÃO vai na URL: o TikTok usa a "URL de redirecionamento"
   cadastrada no app (https://elisa-lima.vercel.app/api/tiktok/callback).
   Mandar o parâmetro aqui só arrisca ser recusado. O state vai junto e volta
   igual no callback, que é como a marca sobrevive à ida e volta.

   O App Key/Secret continuam necessários — mas só na troca do auth_code por
   token, dentro de /api/tiktok/callback. */

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandSlug(brand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
  }

  const serviceId = process.env.TIKTOK_SERVICE_ID;
  if (!serviceId) {
    return NextResponse.json({ error: "TIKTOK_SERVICE_ID não configurado." }, { status: 500 });
  }

  const state = `${brand}:${randomBytes(16).toString("hex")}`;

  const params = new URLSearchParams({
    service_id: serviceId,
    state,
  });

  const authUrl = `https://services.tiktokshop.com/open/authorize?${params}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("tiktok_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
