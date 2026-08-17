DELETE FROM "mensagem" m
USING "conversa" c, "channel_account" ca
WHERE m."conversa_id" = c."id"
  AND c."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "conversa" c
USING "channel_account" ca
WHERE c."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "import_item" ii
USING "import_lote" il, "channel_account" ca
WHERE ii."lote_id" = il."id"
  AND il."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "import_lote" il
USING "channel_account" ca
WHERE il."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "ads_anuncio_snapshot" s
USING "channel_account" ca
WHERE s."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "ads_campanha_snapshot" s
USING "channel_account" ca
WHERE s."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "ads_advertiser" a
USING "channel_account" ca
WHERE a."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "ml_avaliacao_anuncio" a
USING "channel_account" ca
WHERE a."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "sincronizacao_execucao" s
USING "channel_account" ca
WHERE s."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "estoque_canal_saldo" s
USING "produto_canal" pc, "channel_account" ca
WHERE s."produto_canal_id" = pc."id"
  AND pc."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "produto_canal" pc
USING "channel_account" ca
WHERE pc."channel_account_id" = ca."id"
  AND ca."tipo" = 'olist';--> statement-breakpoint
DELETE FROM "pedido_item" pi
USING "pedido" p
WHERE pi."pedido_id" = p."id"
  AND (
    p."canal" = 'olist'
    OR p."channel_account_id" IN (SELECT "id" FROM "channel_account" WHERE "tipo" = 'olist')
  );--> statement-breakpoint
DELETE FROM "pedido"
WHERE "canal" = 'olist'
  OR "channel_account_id" IN (SELECT "id" FROM "channel_account" WHERE "tipo" = 'olist');--> statement-breakpoint
DELETE FROM "regua_execucao" re
USING "regua" r
WHERE re."regua_id" = r."id"
  AND r."canal" = 'olist';--> statement-breakpoint
DELETE FROM "regua"
WHERE "canal" = 'olist';--> statement-breakpoint
DELETE FROM "template_mensagem"
WHERE "canal" = 'olist';--> statement-breakpoint
DELETE FROM "cliente_identidade"
WHERE "canal" = 'olist';--> statement-breakpoint
DELETE FROM "consentimento"
WHERE "canal" = 'olist';--> statement-breakpoint
DELETE FROM "interacao"
WHERE "canal" = 'olist';--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.canal_tokens') IS NOT NULL THEN
    DELETE FROM "canal_tokens" WHERE "canal" = 'olist';
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "channel_account"
WHERE "tipo" = 'olist';--> statement-breakpoint
ALTER TABLE "cliente_identidade" ALTER COLUMN "canal" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "consentimento" ALTER COLUMN "canal" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "interacao" ALTER COLUMN "canal" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."canal_tipo";--> statement-breakpoint
CREATE TYPE "public"."canal_tipo" AS ENUM('whatsapp', 'instagram', 'facebook', 'email', 'mercadolivre', 'shopee', 'tiktokshop', 'manual');--> statement-breakpoint
ALTER TABLE "cliente_identidade" ALTER COLUMN "canal" SET DATA TYPE "public"."canal_tipo" USING "canal"::"public"."canal_tipo";--> statement-breakpoint
ALTER TABLE "consentimento" ALTER COLUMN "canal" SET DATA TYPE "public"."canal_tipo" USING "canal"::"public"."canal_tipo";--> statement-breakpoint
ALTER TABLE "interacao" ALTER COLUMN "canal" SET DATA TYPE "public"."canal_tipo" USING "canal"::"public"."canal_tipo";--> statement-breakpoint
ALTER TABLE "channel_account" ALTER COLUMN "tipo" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."canal_conta_tipo";--> statement-breakpoint
CREATE TYPE "public"."canal_conta_tipo" AS ENUM('mercadolivre', 'shopee', 'tiktokshop', 'whatsapp', 'instagram', 'facebook', 'gmail', 'gcalendar', 'cobranca');--> statement-breakpoint
ALTER TABLE "channel_account" ALTER COLUMN "tipo" SET DATA TYPE "public"."canal_conta_tipo" USING "tipo"::"public"."canal_conta_tipo";
