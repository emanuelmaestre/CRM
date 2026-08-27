CREATE TABLE "exclusao_canal_autorizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"autorizado_por_id" uuid NOT NULL,
	"autorizado_por_email" text NOT NULL,
	"autorizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ADD COLUMN "descartado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedido_ignorado" ADD COLUMN "descartado_por" uuid;--> statement-breakpoint
ALTER TABLE "channel_account" ADD COLUMN "encerrado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_account" ADD COLUMN "dados_excluidos_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exclusao_canal_autorizacao" ADD CONSTRAINT "exclusao_canal_autorizacao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusao_canal_autorizacao" ADD CONSTRAINT "exclusao_canal_autorizacao_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exclusao_autorizacao_conta_admin" ON "exclusao_canal_autorizacao" USING btree ("channel_account_id","autorizado_por_id");--> statement-breakpoint
CREATE INDEX "idx_exclusao_autorizacao_conta" ON "exclusao_canal_autorizacao" USING btree ("channel_account_id");--> statement-breakpoint
ALTER TABLE "exclusao_canal_autorizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exclusao_canal_autorizacao" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_exclusao_canal_autorizacao" ON "exclusao_canal_autorizacao"
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);