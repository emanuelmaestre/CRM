ALTER TABLE "pedido" ADD COLUMN "dados_origem" jsonb;--> statement-breakpoint
ALTER TABLE "pedido" ADD COLUMN "atualizado_origem_em" timestamp with time zone;