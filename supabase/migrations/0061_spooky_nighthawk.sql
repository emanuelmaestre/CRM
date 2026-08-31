CREATE TYPE "public"."conferencia_financeira_status" AS ENUM('persistente', 'aguardando', 'resolvida');--> statement-breakpoint
CREATE TABLE "conferencia_financeira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"provider_order_id" text,
	"bruto_informado" numeric(12, 2) NOT NULL,
	"soma_componentes" numeric(12, 2) NOT NULL,
	"residuo_bruto_centavos" integer NOT NULL,
	"liquido_informado" numeric(12, 2),
	"liquido_reconstruido" numeric(12, 2),
	"residuo_liquido_centavos" integer,
	"classificacao" text NOT NULL,
	"status" "conferencia_financeira_status" NOT NULL,
	"tentativas_rebusca" integer DEFAULT 0 NOT NULL,
	"componentes" jsonb NOT NULL,
	"primeira_deteccao_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_verificacao_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conferencia_financeira" ADD CONSTRAINT "conferencia_financeira_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencia_financeira" ADD CONSTRAINT "conferencia_financeira_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencia_financeira" ADD CONSTRAINT "conferencia_financeira_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conferencia_financeira_pedido" ON "conferencia_financeira" USING btree ("org_id","pedido_id");--> statement-breakpoint
CREATE INDEX "idx_conferencia_financeira_org_status" ON "conferencia_financeira" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_conferencia_financeira_classificacao" ON "conferencia_financeira" USING btree ("org_id","classificacao");