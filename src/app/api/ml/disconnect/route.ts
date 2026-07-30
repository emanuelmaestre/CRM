import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRoute } from "@/shared/lib/auth/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BRAND_ENV = {
  karzi: "NEXT_PUBLIC_BRAND_ID_KARZI",
  wuwu: "NEXT_PUBLIC_BRAND_ID_WUWU",
} as const;

/**
 * Remove o token do Mercado Livre da marca. Existe porque o OAuth reaproveita a
 * sessão aberta no navegador: quem autorizou a conta errada precisa apagar o
 * vínculo antes de reconectar, senão o card fica preso na conta anterior.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (brand !== "karzi" && brand !== "wuwu") {
    return NextResponse.json({ error: "brand deve ser 'karzi' ou 'wuwu'" }, { status: 400 });
  }

  const brandId = process.env[BRAND_ENV[brand]];
  if (!brandId) {
    return NextResponse.json({ error: `${BRAND_ENV[brand]} não configurado` }, { status: 500 });
  }

  const { error } = await supabase
    .from("canal_tokens")
    .delete()
    .eq("org_id", process.env.DEFAULT_ORG_ID!)
    .eq("brand_id", brandId)
    .eq("canal", "mercadolivre");

  if (error) {
    console.error("[ml/disconnect] delete failed", error);
    return NextResponse.json({ error: "Não foi possível desconectar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, brand });
}
