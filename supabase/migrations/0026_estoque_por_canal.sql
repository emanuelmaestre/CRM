-- O estoque passa a ser lido dos canais, e so deles.
--
-- O modelo antigo mantinha um saldo local unico por produto (estoque_saldo),
-- movimentado por um livro-razao (estoque_movimento) e comparado de madrugada
-- contra cada canal (estoque_divergencia). A comparacao nao tinha resposta
-- possivel: um mesmo produto anunciado em N canais era confrontado contra um
-- unico numero local, entao pelo menos uma das comparacoes sempre acusava
-- divergencia, e "aplicar o saldo do canal" quebrava o outro canal.
--
-- Agora cada mapeamento produto/canal guarda o saldo que o proprio canal
-- informa. O saldo do produto passa a ser derivado: como o mesmo lote fisico e
-- anunciado nos tres canais, o total e o MAIOR saldo entre eles, nunca a soma.

DROP TABLE IF EXISTS public.estoque_divergencia;
DROP TYPE IF EXISTS public.estoque_divergencia_status;--> statement-breakpoint

DROP TABLE IF EXISTS public.estoque_movimento;
DROP TYPE IF EXISTS public.movimento_tipo;--> statement-breakpoint

DROP TABLE IF EXISTS public.estoque_saldo;--> statement-breakpoint

CREATE TABLE "estoque_canal_saldo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"produto_canal_id" uuid NOT NULL,
	"saldo" integer NOT NULL,
	"verificado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_canal_saldo" ADD CONSTRAINT "estoque_canal_saldo_produto_canal_id_produto_canal_id_fk" FOREIGN KEY ("produto_canal_id") REFERENCES "public"."produto_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_estoque_canal_saldo_mapeamento" ON "estoque_canal_saldo" USING btree ("produto_canal_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_canal_saldo_produto" ON "estoque_canal_saldo" USING btree ("org_id","produto_id");--> statement-breakpoint
CREATE INDEX "idx_estoque_canal_saldo_conta" ON "estoque_canal_saldo" USING btree ("channel_account_id");--> statement-breakpoint

-- Mesmo padrao das demais tabelas org-scoped: isolamento por org_id e
-- restricao de perfil espelhando o assertPerfil do servico de estoque.
ALTER TABLE public.estoque_canal_saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_canal_saldo FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY rls_estoque_canal_saldo ON public.estoque_canal_saldo
  FOR ALL TO PUBLIC
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);--> statement-breakpoint

CREATE POLICY rls_profile_manager_estoque_canal_saldo ON public.estoque_canal_saldo
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_app_profile() IN ('admin', 'gestor', 'vendedor'))
  WITH CHECK (public.current_app_profile() IN ('admin', 'gestor'));
