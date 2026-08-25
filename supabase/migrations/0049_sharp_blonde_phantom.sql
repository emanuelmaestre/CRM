DROP INDEX "uq_produto_org_sku_active";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produto_org_brand_sku_active" ON "produto" USING btree ("org_id","brand_id","sku") WHERE "produto"."deleted_at" is null;
