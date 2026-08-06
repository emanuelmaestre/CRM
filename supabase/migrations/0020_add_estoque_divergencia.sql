CREATE TYPE "public"."estoque_divergencia_status" AS ENUM('pendente', 'aplicada', 'ignorada');--> statement-breakpoint
CREATE TABLE "estoque_divergencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"produto_canal_id" uuid NOT NULL,
	"saldo_local" integer NOT NULL,
	"saldo_canal" integer NOT NULL,
	"status" "estoque_divergencia_status" DEFAULT 'pendente' NOT NULL,
	"resolvido_por_id" uuid,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estoque_divergencia" ADD CONSTRAINT "estoque_divergencia_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_divergencia" ADD CONSTRAINT "estoque_divergencia_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_divergencia" ADD CONSTRAINT "estoque_divergencia_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_divergencia" ADD CONSTRAINT "estoque_divergencia_resolvido_por_id_app_user_id_fk" FOREIGN KEY ("resolvido_por_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_estoque_divergencia_org" ON "estoque_divergencia" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_divergencia_produto" ON "estoque_divergencia" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_divergencia_status" ON "estoque_divergencia" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_estoque_divergencia_pendente" ON "estoque_divergencia" USING btree ("produto_canal_id") WHERE "estoque_divergencia"."status" = 'pendente';
