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
    .select("brand_id, expires_at")
    .eq("org_id", orgId)
    .eq("canal", "mercadolivre")
    .in("brand_id", [karziId, wuwuId]);

  const now = Date.now();
  const isValid = (brandId: string) => {
    const row = data?.find((r) => r.brand_id === brandId);
    if (!row) return false;
    if (!row.expires_at) return true;
    return new Date(row.expires_at).getTime() > now;
  };

  return NextResponse.json({
    karzi: isValid(karziId),
    wuwu:  isValid(wuwuId),
  });
}
