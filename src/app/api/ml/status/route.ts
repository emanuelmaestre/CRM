import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { BRAND_SLUGS, brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";
import { credencialConfigurada } from "@/shared/config/env-credentials";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type DetalheMarca = {
  conectado: boolean;
  sellerId?: string;
  contaConfere?: boolean;
};

export async function GET(): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin"]);
  if (!auth.ok) return auth.response;

  const orgId = process.env.DEFAULT_ORG_ID!;
  const { data: marcas, error: marcasError } = await supabase
    .from("brand")
    .select("id, slug")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("slug", BRAND_SLUGS);

  if (marcasError) {
    console.error("[ml/status] brand query failed", marcasError);
    return NextResponse.json({ error: "Não foi possível consultar as marcas." }, { status: 500 });
  }

  const brandIds = (marcas ?? []).map((marca) => marca.id);
  const { data: tokens, error: tokensError } = brandIds.length > 0
    ? await supabase
      .from("canal_tokens")
      .select("brand_id, expires_at, seller_id")
      .eq("org_id", orgId)
      .eq("canal", "mercadolivre")
      .in("brand_id", brandIds)
    : { data: [], error: null };

  if (tokensError) {
    console.error("[ml/status] token query failed", tokensError);
    return NextResponse.json({ error: "Não foi possível consultar os tokens." }, { status: 500 });
  }

  const now = Date.now();
  const detalhes = Object.fromEntries(BRAND_SLUGS.map((slug): [BrandSlug, DetalheMarca] => {
    const marca = marcas?.find((item) => item.slug === slug);
    const token = marca ? tokens?.find((item) => item.brand_id === marca.id) : null;
    if (!token) return [slug, { conectado: false }];

    // Mesmo filtro de placeholder do serviço de canais: sem ele o valor
    // `your-ml-seller-id-...` do .env.example vira um falso "conta divergente".
    const esperado = credencialConfigurada(`ML_SELLER_ID_${brandEnvSuffix(slug)}`);
    return [slug, {
      conectado: !token.expires_at || new Date(token.expires_at).getTime() > now,
      sellerId: token.seller_id ?? undefined,
      contaConfere: esperado ? token.seller_id === esperado : undefined,
    }];
  }));

  return NextResponse.json({
    ...Object.fromEntries(BRAND_SLUGS.map((slug) => [slug, detalhes[slug].conectado])),
    detalhes,
  });
}
