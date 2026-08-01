import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { isBrandSlug } from "@/shared/config/brands";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Remove o token do Mercado Livre da marca. Existe porque o OAuth reaproveita a
 * sessão aberta no navegador: quem autorizou a conta errada precisa apagar o
 * vínculo antes de reconectar, senão o card fica preso na conta anterior.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !isBrandSlug(brand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
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
    return NextResponse.json({ error: "Marca ativa não encontrada." }, { status: 404 });
  }
  const brandId = marca.id;

  const { error } = await supabase
    .from("canal_tokens")
    .delete()
    .eq("org_id", orgId)
    .eq("brand_id", brandId)
    .eq("canal", "mercadolivre");

  if (error) {
    console.error("[ml/disconnect] delete failed", error);
    return NextResponse.json({ error: "Não foi possível desconectar." }, { status: 500 });
  }

  const { error: accountError } = await supabase
    .from("channel_account")
    .update({
      status: "desconectado",
      ultima_verificacao: new Date().toISOString(),
      ultimo_erro: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("brand_id", brandId)
    .eq("tipo", "mercadolivre");

  if (accountError) {
    console.error("[ml/disconnect] channel_account update failed", accountError);
    return NextResponse.json({ error: "Token removido, mas o status da conta não foi atualizado." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, brand });
}
