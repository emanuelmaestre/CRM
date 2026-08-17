ALTER TABLE "sincronizacao_execucao" ADD COLUMN "anuncios_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "anuncios_resultado" jsonb;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "anuncios_erro" text;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "avaliacoes_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "avaliacoes_resultado" jsonb;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "avaliacoes_erro" text;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reputacao_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reputacao_resultado" jsonb;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reputacao_erro" text;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reclamacoes_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reclamacoes_resultado" jsonb;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "reclamacoes_erro" text;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "mensagens_status" "sincronizacao_modulo_status" DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "mensagens_resultado" jsonb;--> statement-breakpoint
ALTER TABLE "sincronizacao_execucao" ADD COLUMN "mensagens_erro" text;--> statement-breakpoint
UPDATE "sincronizacao_execucao"
SET
	"anuncios_status" = 'concluido',
	"anuncios_resultado" = '{"legado":true,"mensagem":"Execução criada antes da sincronização completa."}'::jsonb,
	"avaliacoes_status" = 'concluido',
	"avaliacoes_resultado" = '{"legado":true,"mensagem":"Execução criada antes da sincronização completa."}'::jsonb,
	"reputacao_status" = 'concluido',
	"reputacao_resultado" = '{"legado":true,"mensagem":"Execução criada antes da sincronização completa."}'::jsonb,
	"reclamacoes_status" = 'concluido',
	"reclamacoes_resultado" = '{"legado":true,"mensagem":"Execução criada antes da sincronização completa."}'::jsonb,
	"mensagens_status" = 'concluido',
	"mensagens_resultado" = '{"legado":true,"mensagem":"Execução criada antes da sincronização completa."}'::jsonb
WHERE "finalizado_em" IS NOT NULL;
