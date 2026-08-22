CREATE TABLE "metricas_snapshot_diario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"data" date NOT NULL,
	"score_geral" integer,
	"giro_baixo_qtd" integer NOT NULL,
	"giro_baixo_valor_parado" numeric(12, 2) NOT NULL,
	"parados_qtd" integer NOT NULL,
	"parados_valor_parado" numeric(12, 2) NOT NULL,
	"reposicao_qtd" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metricas_snapshot_diario" ADD CONSTRAINT "metricas_snapshot_diario_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_metricas_snapshot_org_data" ON "metricas_snapshot_diario" USING btree ("org_id","data");--> statement-breakpoint
CREATE INDEX "idx_metricas_snapshot_org" ON "metricas_snapshot_diario" USING btree ("org_id");
--> statement-breakpoint
-- RLS na hora da criação — não depois. É exatamente o achado do pentest de
-- 17/08 (3 tabelas de Anúncios criadas sem RLS, corrigido só no dia
-- seguinte) que esta tabela não pode repetir. Mesmo padrão de score_historico
-- (também só lido por job/serviço, nunca por query direta do usuário).
ALTER TABLE "metricas_snapshot_diario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metricas_snapshot_diario" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rls_metricas_snapshot_diario" ON "metricas_snapshot_diario"
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);