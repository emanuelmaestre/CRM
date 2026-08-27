CREATE TYPE "public"."pedido_ignorado_causa" AS ENUM('sku_sem_produto', 'cliente_duplicado', 'payload_invalido', 'desconhecida');--> statement-breakpoint
CREATE TABLE "pedido_ignorado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"provider_order_id" text NOT NULL,
	"causa" "pedido_ignorado_causa" DEFAULT 'desconhecida' NOT NULL,
	"motivo" text NOT NULL,
	"skus" text[],
	"payload" jsonb,
	"tentativas" integer DEFAULT 1 NOT NULL,
	"primeira_vez_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_vez_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ADD CONSTRAINT "pedido_ignorado_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ADD CONSTRAINT "pedido_ignorado_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ADD CONSTRAINT "pedido_ignorado_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pedido_ignorado_conta_pedido" ON "pedido_ignorado" USING btree ("channel_account_id","provider_order_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_ignorado_org_pendente" ON "pedido_ignorado" USING btree ("org_id","resolvido_em");--> statement-breakpoint
CREATE INDEX "idx_pedido_ignorado_causa" ON "pedido_ignorado" USING btree ("org_id","causa");--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedido_ignorado" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_pedido_ignorado" ON "pedido_ignorado"
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
