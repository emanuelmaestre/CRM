CREATE INDEX IF NOT EXISTS "idx_estoque_canal_saldo_org_verificado" ON "estoque_canal_saldo" USING btree ("org_id","verificado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_produto_org_atualizado" ON "produto" USING btree ("org_id","atualizado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_produto_canal_org_atualizado" ON "produto_canal" USING btree ("org_id","atualizado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pedido_org_atualizado" ON "pedido" USING btree ("org_id","atualizado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ml_avaliacao_org_atualizado" ON "ml_avaliacao_anuncio" USING btree ("org_id","atualizado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shopee_avaliacao_org_atualizado" ON "shopee_avaliacao_anuncio" USING btree ("org_id","atualizado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sincronizacao_org_conta_iniciado" ON "sincronizacao_execucao" USING btree ("org_id","channel_account_id","iniciado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sincronizacao_org_iniciado" ON "sincronizacao_execucao" USING btree ("org_id","iniciado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ads_anuncio_snapshot_org_criado" ON "ads_anuncio_snapshot" USING btree ("org_id","criado_em");