import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { channelAccount } from "@/shared/lib/db/schema";

type Marketplace = "mercadolivre" | "shopee" | "tiktokshop" | "olist";
type BrandSlug = "karzi" | "wuwu";

const AccountConfigSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
  brandSlug: z.enum(["karzi", "wuwu"]),
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
  const candidatas = (["KARZI", "WUWU"] as const)
    .map((slug) => AccountConfigSchema.safeParse({
      orgId: process.env.DEFAULT_ORG_ID,
      brandId: process.env[`NEXT_PUBLIC_BRAND_ID_${slug}`],
      brandSlug: slug.toLowerCase(),
      externalAccountId: process.env[`${EXTERNAL_ID_ENV[tipo]}_${slug}`],
    }))
    .filter((result) => result.success)
    .map((result) => result.data);

  const config = candidatas.find((item) => item.externalAccountId === externalAccountId);
  if (!config) throw new Error(`Conta externa de ${tipo} não reconhecida.`);

  const conta = await db.select({ id: channelAccount.id }).from(channelAccount).where(and(
    eq(channelAccount.orgId, config.orgId),
    eq(channelAccount.brandId, config.brandId),
    eq(channelAccount.tipo, tipo),
  )).then((rows) => rows[0]);
  if (!conta) throw new Error(`Conta ${tipo}/${config.brandSlug} não provisionada.`);

  return { ...config, channelAccountId: conta.id };
}
