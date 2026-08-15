CREATE TYPE "public"."sincronizacao_modulo_status" AS ENUM('pendente', 'em_andamento', 'concluido', 'erro');--> statement-breakpoint
CREATE TABLE "estoque_canal_saldo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"produto_canal_id" uuid NOT NULL,
	"saldo" integer NOT NULL,
	"verificado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
DROP TABLE "estoque_divergencia" CASCADE;--> statement-breakpoint
DROP TABLE "estoque_movimento" CASCADE;--> statement-breakpoint
DROP TABLE "estoque_saldo" CASCADE;--> statement-breakpoint
DROP TABLE "evento_agenda" CASCADE;--> statement-breakpoint
DROP TABLE "tarefa" CASCADE;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_produto_canal_id_produto_canal_id_fk" FOREIGN KEY ("produto_canal_id") REFERENCES "public"."produto_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD CONSTRAINT "sincronizacao_execucao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD CONSTRAINT "sincronizacao_execucao_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_estoque_canal_saldo_mapeamento" ON "estoque_canal_saldo" USING btree ("produto_canal_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_canal_saldo_produto" ON "estoque_canal_saldo" USING btree ("org_id","produto_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_canal_saldo_conta" ON "estoque_canal_saldo" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "idx_sincronizacao_org" ON "sincronizacao_execucao" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_sincronizacao_channel_account" ON "sincronizacao_execucao" USING btree ("channel_account_id");--> statement-breakpoint
DROP TYPE "public"."estoque_divergencia_status";--> statement-breakpoint
DROP TYPE "public"."movimento_tipo";--> statement-breakpoint
DROP TYPE "public"."tarefa_status";