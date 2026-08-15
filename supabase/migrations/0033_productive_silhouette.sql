ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "ad_group_id" text;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "recomendado" boolean;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "buy_box_winner" boolean;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "logistic_type" text;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "domain_id" text;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "permalink" text;--> statement-breakpoint
ALTER TABLE "ads_anuncio_snapshot" ADD COLUMN "thumbnail" text;--> statement-breakpoint
ALTER TABLE "ads_campanha_snapshot" ADD COLUMN "acos_objetivo" numeric(6, 2);