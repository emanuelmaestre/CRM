ALTER TABLE "oportunidade" ALTER COLUMN "cliente_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "data_nascimento" date;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_identidade_org_canal_external" ON "cliente_identidade" USING btree ("org_id","canal","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_movimento_referencia" ON "estoque_movimento" USING btree ("org_id","produto_id","referencia_tipo","referencia_id") WHERE "estoque_movimento"."referencia_tipo" is not null and "estoque_movimento"."referencia_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pedido_org_canal_provider" ON "pedido" USING btree ("org_id","canal","provider_order_id") WHERE "pedido"."provider_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversa_conta_external" ON "conversa" USING btree ("org_id","channel_account_id","external_id") WHERE "conversa"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mensagem_org_provider" ON "mensagem" USING btree ("org_id","provider_message_id") WHERE "mensagem"."provider_message_id" is not null;
