CREATE TABLE "canal_verificacao" (
	"org_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"verificado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canal_verificacao_channel_account_id_modulo_pk" PRIMARY KEY("channel_account_id","modulo")
);
--> statement-breakpoint
ALTER TABLE "canal_verificacao" ADD CONSTRAINT "canal_verificacao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_verificacao" ADD CONSTRAINT "canal_verificacao_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_canal_verificacao_org" ON "canal_verificacao" USING btree ("org_id");--> statement-breakpoint
-- Mesma trava das demais tabelas com org_id (ver 0047): a tabela nasce
-- fechada em vez de virar a exceção que ninguém revisa depois.
ALTER TABLE "canal_verificacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canal_verificacao" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_canal_verificacao" ON "canal_verificacao"
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
