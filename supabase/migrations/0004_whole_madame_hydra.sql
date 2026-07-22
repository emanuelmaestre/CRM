CREATE TABLE "produto_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"external_listing_id" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produto_canal" ADD CONSTRAINT "produto_canal_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_canal" ADD CONSTRAINT "produto_canal_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_canal" ADD CONSTRAINT "produto_canal_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_produto_canal_produto" ON "produto_canal" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "idx_produto_canal_conta" ON "produto_canal" USING btree ("channel_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produto_canal" ON "produto_canal" USING btree ("produto_id","channel_account_id");