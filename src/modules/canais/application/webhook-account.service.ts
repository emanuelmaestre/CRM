import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";

type Marketplace = "mercadolivre" | "shopee" | "tiktokshop" | "olist";
type BrandSlug = "karzi" | "wuwu";

const AccountConfigSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
  brandSlug: z.enum(["karzi", "wuwu"]),
  channelAccountId: z.uuid(),
  externalAccountId: z.string().min(1),
});

const EXTERNAL_ID_ENV: Record<Marketplace, string> = {
  mercadolivre: "ML_SELLER_ID",
  shopee: "SHOPEE_SHOP_ID",
  tiktokshop: "TIKTOK_SHOP_ID",
  olist: "OLIST_SHOP_ID",
};

export async function resolverContaWebhookMarketplace(
  tipo: Marketplace,
  externalAccountId: string,
): Promise<{ orgId: string; brandId: string; brandSlug: BrandSlug; channelAccountId: string }> {
  const orgId = z.uuid().parse(process.env.DEFAULT_ORG_ID);
  const contas = await db
    .select({
      orgId: channelAccount.orgId,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
      channelAccountId: channelAccount.id,
      meta: channelAccount.meta,
    })
    .from(channelAccount)
    .innerJoin(brand, and(
      eq(brand.id, channelAccount.brandId),
      eq(brand.orgId, channelAccount.orgId),
    ))
    .where(and(
      eq(channelAccount.orgId, orgId),
      eq(channelAccount.tipo, tipo),
    ));

  const candidatas = contas
    .map((conta) => {
      const upper = conta.brandSlug.toUpperCase();
      const meta = conta.meta as Record<string, unknown> | null;
      return AccountConfigSchema.safeParse({
        ...conta,
        externalAccountId:
          (typeof meta?.externalAccountId === "string" ? meta.externalAccountId : undefined)
          ?? process.env[`${EXTERNAL_ID_ENV[tipo]}_${upper}`],
      });
    })
    .filter((result) => result.success)
    .map((result) => result.data);

  const config = candidatas.find((item) => item.externalAccountId === externalAccountId);
  if (!config) throw new Error(`Conta externa de ${tipo} não reconhecida.`);

  return {
    orgId: config.orgId,
    brandId: config.brandId,
    brandSlug: config.brandSlug,
    channelAccountId: config.channelAccountId,
  };
}
