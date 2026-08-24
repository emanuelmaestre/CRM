CREATE TABLE "shopee_api_call" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "caminho" text NOT NULL,
  "status_code" integer,
  "ok" boolean NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopee_api_call" ADD CONSTRAINT "shopee_api_call_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_shopee_api_call_org_criado" ON "shopee_api_call" USING btree ("org_id","criado_em");
--> statement-breakpoint
ALTER TABLE "shopee_api_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopee_api_call" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_shopee_api_call" ON "shopee_api_call"
  FOR ALL TO authenticated
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
