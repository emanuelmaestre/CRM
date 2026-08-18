CREATE TABLE "backup_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"solicitado_por_id" uuid,
	"status" text DEFAULT 'processando' NOT NULL,
	"tabelas" jsonb,
	"dados_parciais" jsonb,
	"storage_path" text,
	"tamanho_bytes" integer,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "backup_export" ADD CONSTRAINT "backup_export_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_export" ADD CONSTRAINT "backup_export_solicitado_por_id_app_user_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_backup_export_org" ON "backup_export" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_backup_export_criado" ON "backup_export" USING btree ("criado_em");