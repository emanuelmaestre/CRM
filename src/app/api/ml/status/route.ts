import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(): Promise<NextResponse> {
  const orgId    = process.env.DEFAULT_ORG_ID!;
  const karziId  = process.env.NEXT_PUBLIC_BRAND_ID_KARZI!;
  const wuwuId   = process.env.NEXT_PUBLIC_BRAND_ID_WUWU!;

  const { data } = await supabase
    .from("canal_tokens")
    .select("brand_id, expires_at, seller_id")
    .eq("org_id", orgId)
    .eq("canal", "mercadolivre")
    .in("brand_id", [karziId, wuwuId]);

  const now = Date.now();
  const resumo = (brand: "karzi" | "wuwu", brandId: string) => {
    const row = data?.find((r) => r.brand_id === brandId);
    if (!row) return { conectado: false as const };

    const esperado = process.env[`ML_SELLER_ID_${brand.toUpperCase()}`];
    return {
      conectado: !row.expires_at || new Date(row.expires_at).getTime() > now,
      sellerId:  row.seller_id ?? undefined,
      // Alerta se a marca ficou com o token de outra conta.
      contaConfere: esperado ? row.seller_id === esperado : undefined,
    };
  };

  const karzi = resumo("karzi", karziId);
  const wuwu  = resumo("wuwu", wuwuId);

  return NextResponse.json({
    // Formato plano mantido para o componente existente.
    karzi: karzi.conectado,
    wuwu:  wuwu.conectado,
    detalhes: { karzi, wuwu },
  });
}
