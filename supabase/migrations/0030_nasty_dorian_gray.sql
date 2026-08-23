-- A tabela "estoque_canal_saldo" e todos os seus ADD CONSTRAINT/CREATE INDEX
-- NAO estao aqui de proposito: ja foram feitos na 0026 (estoque_por_canal).
-- Da mesma forma, os DROP TABLE/DROP TYPE de estoque_divergencia,
-- estoque_movimento, estoque_saldo (dropados na 0026) e evento_agenda, tarefa
-- (dropados na 0027) tambem NAO estao aqui. O drizzle-kit gerou esta
-- migration com todos esses comandos duplicados (provavel dessincronia de
-- snapshot na epoca), que so falhavam ao aplicar a sequencia inteira num
-- banco limpo do zero — em qualquer banco que ja rodou 0026/0027 (todo
-- ambiente real) esses comandos nunca chegavam a executar de fato, porque a
-- migration inteira ja tinha sido registrada como aplicada antes desta
-- correcao existir. Os comandos abaixo referentes a "sincronizacao_execucao"
-- (tabela nova de fato) continuam intactos.
CREATE TYPE "public"."sincronizacao_modulo_status" AS ENUM('pendente', 'em_andamento', 'concluido', 'erro');--> statement-breakpoint
CREATE TABLE "sincronizacao_execucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"catalogo_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL,
	"catalogo_resultado" jsonb,
	"catalogo_erro" text,
	"pedidos_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL,
	"pedidos_resultado" jsonb,
	"pedidos_erro" text,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD CONSTRAINT "sincronizacao_execucao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD CONSTRAINT "sincronizacao_execucao_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sincronizacao_org" ON "sincronizacao_execucao" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_sincronizacao_channel_account" ON "sincronizacao_execucao" USING btree ("channel_account_id");