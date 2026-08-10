CREATE TABLE "ml_avaliacao_anuncio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"listing_id" text NOT NULL,
	"title" text NOT NULL,
	"permalink" text,
	"rating_average" real,
	"reviews_total" integer,
	"rating_levels" jsonb,
	"opinioes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ml_avaliacao_anuncio" ADD CONSTRAINT "ml_avaliacao_anuncio_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_avaliacao_anuncio" ADD CONSTRAINT "ml_avaliacao_anuncio_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_avaliacao_anuncio" ADD CONSTRAINT "ml_avaliacao_anuncio_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ml_avaliacao_org_listing" ON "ml_avaliacao_anuncio" USING btree ("org_id","listing_id");--> statement-breakpoint
CREATE INDEX "idx_ml_avaliacao_brand" ON "ml_avaliacao_anuncio" USING btree ("brand_id");