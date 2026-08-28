ALTER TABLE "produto_canal" ADD COLUMN "status_anuncio" text;--> statement-breakpoint
ALTER TABLE "produto_canal" ADD COLUMN "status_verificado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "produto_canal" ADD COLUMN "preco_anuncio" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "produto_canal" ADD COLUMN "imagem_url" text;--> statement-breakpoint
ALTER TABLE "produto_canal" ADD COLUMN "permalink" text;--> statement-breakpoint
-- Backfill: o que a A5 já coletou do Mercado Livre passa a viver nas colunas
-- de canal. Sem isto, a tela de Estoque Parado perderia o status de 656
-- vínculos do ML no instante em que passasse a ler a coluna nova — o dado
-- existe, só estava guardado com nome de um canal só.
UPDATE "produto_canal"
SET "status_anuncio" = "ml_status_anuncio",
    "status_verificado_em" = "ml_status_verificado_em"
WHERE "ml_status_anuncio" IS NOT NULL;
