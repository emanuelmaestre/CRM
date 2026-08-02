import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, produtoCanal } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { isBrandSlug } from "@/shared/config/brands";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin", "gestor"]);
  if (!auth.ok) return auth.response;

  const rawBrand = request.nextUrl.searchParams.get("brand");
  if (!rawBrand || !isBrandSlug(rawBrand)) {
    return NextResponse.json({ error: "Marca não suportada." }, { status: 400 });
  }

  const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(50, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  const conta = await db
    .select({ id: channelAccount.id, brandId: channelAccount.brandId, status: channelAccount.status })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, auth.contexto.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(brand.slug, rawBrand),
      eq(brand.active, true),
    ))
    .then((rows) => rows[0]);

  if (!conta) return NextResponse.json({ error: "Conta Mercado Livre não cadastrada." }, { status: 404 });
  if (conta.status !== "conectado") {
    return NextResponse.json({ error: "Conta Mercado Livre não está conectada." }, { status: 409 });
  }

  try {
    const [catalogo, mapeamentos] = await Promise.all([
      criarMLProvider(rawBrand).then((provider) => provider.listarAnunciosAtivos({ offset, limit })),
      db
        .select({
          produtoId: produtoCanal.produtoId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
        })
        .from(produtoCanal)
        .where(and(
          eq(produtoCanal.orgId, auth.contexto.orgId),
          eq(produtoCanal.channelAccountId, conta.id),
          eq(produtoCanal.ativo, true),
        )),
    ]);

    return NextResponse.json({
      brand: rawBrand,
      brandId: conta.brandId,
      channelAccountId: conta.id,
      totalListings: catalogo.totalListings,
      offset: catalogo.offset,
      limit: catalogo.limit,
      items: catalogo.items.map((item) => {
        const mapping = mapeamentos.find((row) =>
          row.externalListingId === item.listingId
          && (item.variationId
            ? row.externalWarehouseId === item.variationId
            : !row.externalWarehouseId)
          && (!item.externalSku || !row.externalSkuId || row.externalSkuId === item.externalSku),
        );
        return { ...item, mappedProductId: mapping?.produtoId ?? null };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar anúncios.";
    const status = /expirado|401/.test(message) ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
