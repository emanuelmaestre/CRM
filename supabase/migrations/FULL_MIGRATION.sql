-- ===== PARTE 1: TABELAS (gerado pelo Drizzle) =====

CREATE TYPE "public"."perfil" AS ENUM('admin', 'gestor', 'vendedor');--> statement-breakpoint
CREATE TYPE "public"."canal_tipo" AS ENUM('whatsapp', 'instagram', 'facebook', 'email', 'mercadolivre', 'shopee', 'tiktokshop', 'manual');--> statement-breakpoint
CREATE TYPE "public"."finalidade_consentimento" AS ENUM('marketing', 'avaliacao', 'suporte', 'cobranca');--> statement-breakpoint
CREATE TYPE "public"."status_consentimento" AS ENUM('ativo', 'revogado');--> statement-breakpoint
CREATE TYPE "public"."movimento_tipo" AS ENUM('entrada', 'saida', 'ajuste', 'reserva', 'estorno');--> statement-breakpoint
CREATE TYPE "public"."pedido_status" AS ENUM('criado', 'pago', 'separado', 'enviado', 'entregue', 'avaliacao_solicitada', 'concluido', 'cancelado', 'devolvido');--> statement-breakpoint
CREATE TYPE "public"."tarefa_status" AS ENUM('pendente', 'em_andamento', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."canal_conta_status" AS ENUM('conectado', 'degradado', 'desconectado');--> statement-breakpoint
CREATE TYPE "public"."canal_conta_tipo" AS ENUM('mercadolivre', 'shopee', 'tiktokshop', 'whatsapp', 'instagram', 'facebook', 'gmail', 'gcalendar', 'cobranca');--> statement-breakpoint
CREATE TYPE "public"."conversa_status" AS ENUM('nova', 'em_atendimento', 'aguardando_cliente', 'resolvida', 'arquivada');--> statement-breakpoint
CREATE TYPE "public"."mensagem_direcao" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."execucao_status" AS ENUM('elegivel', 'gates_aprovados', 'agendada', 'enviada', 'confirmada', 'falhou', 'falha_definitiva', 'bloqueada');--> statement-breakpoint
CREATE TYPE "public"."gatilho_tipo" AS ENUM('pedido_entregue', 'aniversario', 'sem_compra', 'manual', 'evento_dominio');--> statement-breakpoint
CREATE TYPE "public"."regua_status" AS ENUM('ativa', 'pausada', 'arquivada');--> statement-breakpoint
CREATE TABLE "brand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cnpj" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"perfil" "perfil" DEFAULT 'vendedor' NOT NULL,
	"ativo" text DEFAULT 'true' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"telefone" text,
	"cpf_cnpj" text,
	"deleted_at" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_identidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"canal" "canal_tipo" NOT NULL,
	"external_id" text NOT NULL,
	"meta" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_tag" (
	"cliente_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consentimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"finalidade" "finalidade_consentimento" NOT NULL,
	"canal" "canal_tipo" NOT NULL,
	"status" "status_consentimento" DEFAULT 'ativo' NOT NULL,
	"origem" text NOT NULL,
	"prova" text,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid,
	"tipo" text NOT NULL,
	"canal" "canal_tipo",
	"resumo" text,
	"meta" jsonb,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segmento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"filtros" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_movimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"tipo" "movimento_tipo" NOT NULL,
	"quantidade" integer NOT NULL,
	"referencia_id" uuid,
	"referencia_tipo" text,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_saldo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"saldo" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estoque_saldo_produto_id_unique" UNIQUE("produto_id")
);
--> statement-breakpoint
CREATE TABLE "produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"nome" text NOT NULL,
	"custo" numeric(12, 2),
	"preco" numeric(12, 2) NOT NULL,
	"estoque_minimo" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cliente_id" uuid,
	"responsavel_id" uuid,
	"titulo" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funil_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	"cor" text
);
--> statement-breakpoint
CREATE TABLE "oportunidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"etapa_id" uuid NOT NULL,
	"responsavel_id" uuid,
	"titulo" text NOT NULL,
	"valor" numeric(12, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"provider_order_id" text,
	"canal" text NOT NULL,
	"status" "pedido_status" DEFAULT 'criado' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"frete" numeric(12, 2) DEFAULT '0',
	"desconto" numeric(12, 2) DEFAULT '0',
	"cancelado_motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"preco_unitario" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarefa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cliente_id" uuid,
	"responsavel_id" uuid,
	"titulo" text NOT NULL,
	"descricao" text,
	"status" "tarefa_status" DEFAULT 'pendente' NOT NULL,
	"vencimento_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid,
	"autor_id" uuid,
	"autor_tipo" text DEFAULT 'usuario' NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_dominio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"causation_id" uuid,
	"payload" jsonb NOT NULL,
	"processado" text DEFAULT 'false' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"nome" text NOT NULL,
	"status" text DEFAULT 'rodando' NOT NULL,
	"tentativa" text DEFAULT '1' NOT NULL,
	"erro" text,
	"payload" jsonb,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"tipo" "canal_conta_tipo" NOT NULL,
	"nome" text NOT NULL,
	"status" "canal_conta_status" DEFAULT 'desconectado' NOT NULL,
	"vault_key" text NOT NULL,
	"meta" jsonb,
	"ultima_verificacao" timestamp with time zone,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"cliente_id" uuid,
	"channel_account_id" uuid NOT NULL,
	"responsavel_id" uuid,
	"status" "conversa_status" DEFAULT 'nova' NOT NULL,
	"external_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"direcao" "mensagem_direcao" NOT NULL,
	"tipo" text DEFAULT 'texto' NOT NULL,
	"conteudo" text NOT NULL,
	"provider_message_id" text,
	"entregue" boolean DEFAULT false NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_lote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"status" text DEFAULT 'processando' NOT NULL,
	"total_linhas" integer,
	"aceitos" integer DEFAULT 0 NOT NULL,
	"rejeitados" integer DEFAULT 0 NOT NULL,
	"erros" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regua" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"gatilho" "gatilho_tipo" NOT NULL,
	"status" "regua_status" DEFAULT 'ativa' NOT NULL,
	"condicoes" jsonb,
	"template_id" uuid,
	"canal" text NOT NULL,
	"delay_dias" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regua_execucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"regua_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "execucao_status" DEFAULT 'elegivel' NOT NULL,
	"gate_bloqueado" text,
	"motivo_bloqueio" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"agendada_em" timestamp with time zone,
	"enviada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regua_execucao_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "template_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"canal" text NOT NULL,
	"conteudo" text NOT NULL,
	"variaveis" jsonb,
	"aprovado" text DEFAULT 'false' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_gerado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"storage_url" text,
	"dados_origem" jsonb,
	"gerado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"conteudo" text NOT NULL,
	"numeros_fonte" jsonb,
	"confianca" numeric(4, 3),
	"valido_ate" timestamp with time zone,
	"modelo_usado" text,
	"prompt_version" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finalidade" text NOT NULL,
	"modelo" text NOT NULL,
	"prompt_version" text,
	"tokens_input" integer,
	"tokens_output" integer,
	"custo_usd" numeric(10, 6),
	"duracao_ms" integer,
	"sucesso" text DEFAULT 'true' NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"churn_risk" integer DEFAULT 0 NOT NULL,
	"rfm_recencia" integer DEFAULT 0 NOT NULL,
	"rfm_frequencia" integer DEFAULT 0 NOT NULL,
	"rfm_valor" numeric(12, 2),
	"proxima_compra_estimada" timestamp with time zone,
	"explicacao" text,
	"versao_formula" text DEFAULT 'v1' NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_cliente_cliente_id_unique" UNIQUE("cliente_id")
);
--> statement-breakpoint
CREATE TABLE "score_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"risco_encalhe" integer DEFAULT 0 NOT NULL,
	"dias_sem_venda" integer DEFAULT 0 NOT NULL,
	"capital_parado" numeric(12, 2),
	"acao_sugerida" text,
	"versao_formula" text DEFAULT 'v1' NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_produto_produto_id_unique" UNIQUE("produto_id")
);
--> statement-breakpoint
CREATE TABLE "sugestao_campanha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"segmento_descricao" text NOT NULL,
	"oferta" text NOT NULL,
	"desconto_minimo" numeric(5, 2),
	"status" text DEFAULT 'sugerida' NOT NULL,
	"motivo_rejeicao" text,
	"aprovado_por_id" uuid,
	"expirado_em" timestamp with time zone,
	"modelo_usado" text,
	"prompt_version" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_identidade" ADD CONSTRAINT "cliente_identidade_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_identidade" ADD CONSTRAINT "cliente_identidade_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_tag" ADD CONSTRAINT "cliente_tag_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_tag" ADD CONSTRAINT "cliente_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimento" ADD CONSTRAINT "consentimento_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimento" ADD CONSTRAINT "consentimento_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimento" ADD CONSTRAINT "consentimento_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacao" ADD CONSTRAINT "interacao_autor_id_app_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segmento" ADD CONSTRAINT "segmento_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimento" ADD CONSTRAINT "estoque_movimento_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimento" ADD CONSTRAINT "estoque_movimento_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_saldo" ADD CONSTRAINT "estoque_saldo_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_saldo" ADD CONSTRAINT "estoque_saldo_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD CONSTRAINT "evento_agenda_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD CONSTRAINT "evento_agenda_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD CONSTRAINT "evento_agenda_responsavel_id_app_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_etapa" ADD CONSTRAINT "funil_etapa_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_etapa_id_funil_etapa_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."funil_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_responsavel_id_app_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_responsavel_id_app_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_dominio" ADD CONSTRAINT "evento_dominio_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_dominio" ADD CONSTRAINT "evento_dominio_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_responsavel_id_app_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_lote" ADD CONSTRAINT "import_lote_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua" ADD CONSTRAINT "regua_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua" ADD CONSTRAINT "regua_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_execucao" ADD CONSTRAINT "regua_execucao_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_execucao" ADD CONSTRAINT "regua_execucao_regua_id_regua_id_fk" FOREIGN KEY ("regua_id") REFERENCES "public"."regua"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_execucao" ADD CONSTRAINT "regua_execucao_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_gerado" ADD CONSTRAINT "documento_gerado_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight" ADD CONSTRAINT "insight_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run" ADD CONSTRAINT "llm_run_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_cliente" ADD CONSTRAINT "score_cliente_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_cliente" ADD CONSTRAINT "score_cliente_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_produto" ADD CONSTRAINT "score_produto_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_produto" ADD CONSTRAINT "score_produto_produto_id_produto_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugestao_campanha" ADD CONSTRAINT "sugestao_campanha_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cliente_org" ON "cliente" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_cliente_email" ON "cliente" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_cliente_telefone" ON "cliente" USING btree ("telefone");--> statement-breakpoint
CREATE INDEX "idx_cliente_cpf" ON "cliente" USING btree ("cpf_cnpj");--> statement-breakpoint
CREATE INDEX "idx_identidade_cliente" ON "cliente_identidade" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_identidade_external" ON "cliente_identidade" USING btree ("canal","external_id");--> statement-breakpoint
CREATE INDEX "idx_cliente_tag" ON "cliente_tag" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_consentimento_cliente" ON "consentimento" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_consentimento_brand" ON "consentimento" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_interacao_cliente" ON "interacao" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_interacao_criado" ON "interacao" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_movimento_produto" ON "estoque_movimento" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "idx_movimento_criado" ON "estoque_movimento" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_saldo_produto" ON "estoque_saldo" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "idx_produto_org_brand" ON "produto" USING btree ("org_id","brand_id");--> statement-breakpoint
CREATE INDEX "idx_produto_sku" ON "produto" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "idx_evento_agenda_org" ON "evento_agenda" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_evento_agenda_inicio" ON "evento_agenda" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "idx_oportunidade_org" ON "oportunidade" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_oportunidade_cliente" ON "oportunidade" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_org" ON "pedido" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_cliente" ON "pedido" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_brand" ON "pedido" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_status" ON "pedido" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pedido_provider" ON "pedido" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_item_pedido" ON "pedido_item" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "idx_tarefa_org" ON "tarefa" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_tarefa_responsavel" ON "tarefa" USING btree ("responsavel_id");--> statement-breakpoint
CREATE INDEX "idx_tarefa_vencimento" ON "tarefa" USING btree ("vencimento_em");--> statement-breakpoint
CREATE INDEX "idx_audit_org" ON "audit_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_audit_entidade" ON "audit_log" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "idx_audit_criado" ON "audit_log" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_evento_tipo" ON "evento_dominio" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "idx_evento_org" ON "evento_dominio" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_evento_criado" ON "evento_dominio" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_job_nome" ON "job_run" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "idx_job_status" ON "job_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_channel_org" ON "channel_account" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_channel_brand" ON "channel_account" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_conversa_org" ON "conversa" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_conversa_brand" ON "conversa" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_conversa_cliente" ON "conversa" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_conversa_status" ON "conversa" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mensagem_conversa" ON "mensagem" USING btree ("conversa_id");--> statement-breakpoint
CREATE INDEX "idx_mensagem_provider" ON "mensagem" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "idx_mensagem_criado" ON "mensagem" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_import_org" ON "import_lote" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_regua_org" ON "regua" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_regua_brand" ON "regua" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_regua_gatilho" ON "regua" USING btree ("gatilho");--> statement-breakpoint
CREATE INDEX "idx_execucao_regua" ON "regua_execucao" USING btree ("regua_id");--> statement-breakpoint
CREATE INDEX "idx_execucao_cliente" ON "regua_execucao" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_execucao_status" ON "regua_execucao" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_template_org_brand" ON "template_mensagem" USING btree ("org_id","brand_id");--> statement-breakpoint
CREATE INDEX "idx_documento_org" ON "documento_gerado" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_insight_org" ON "insight" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_insight_tipo" ON "insight" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "idx_llm_org" ON "llm_run" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_llm_criado" ON "llm_run" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "idx_score_cliente_org" ON "score_cliente" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_score_cliente_churn" ON "score_cliente" USING btree ("churn_risk");--> statement-breakpoint
CREATE INDEX "idx_score_produto_org" ON "score_produto" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_score_produto_risco" ON "score_produto" USING btree ("risco_encalhe");--> statement-breakpoint
CREATE INDEX "idx_sugestao_org" ON "sugestao_campanha" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_sugestao_status" ON "sugestao_campanha" USING btree ("status");

-- ===== PARTE 2: RLS + TRIGGERS + CONSTRAINTS + ÍNDICES =====

-- =============================================================================
-- CRM LEO â€” MigraÃ§Ã£o inicial
-- Drizzle cria as tabelas; esta migraÃ§Ã£o adiciona:
--   1. Trigger set_updated_at em todas as tabelas com atualizado_em
--   2. RLS habilitado + policies org_id em todas as tabelas
--   3. Constraints CHECK para state machines
--   4. Ãndices GIN para busca de texto
--   5. Constraint de saldo nÃ£o-negativo no estoque
--   6. Unique constraint idempotÃªncia inbox
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNÃ‡ÃƒO UTILITÃRIA: set_updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. TRIGGERS set_updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_org_updated_at
  BEFORE UPDATE ON org
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brand_updated_at
  BEFORE UPDATE ON brand
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_user_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cliente_updated_at
  BEFORE UPDATE ON cliente
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_segmento_updated_at
  BEFORE UPDATE ON segmento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_produto_updated_at
  BEFORE UPDATE ON produto
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_estoque_saldo_updated_at
  BEFORE UPDATE ON estoque_saldo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedido_updated_at
  BEFORE UPDATE ON pedido
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oportunidade_updated_at
  BEFORE UPDATE ON oportunidade
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tarefa_updated_at
  BEFORE UPDATE ON tarefa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_channel_account_updated_at
  BEFORE UPDATE ON channel_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversa_updated_at
  BEFORE UPDATE ON conversa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_regua_updated_at
  BEFORE UPDATE ON regua
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_template_mensagem_updated_at
  BEFORE UPDATE ON template_mensagem
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_regua_execucao_updated_at
  BEFORE UPDATE ON regua_execucao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sugestao_campanha_updated_at
  BEFORE UPDATE ON sugestao_campanha
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- Habilitar RLS em todas as tabelas de dados
ALTER TABLE org                ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_identidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE consentimento      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_tag        ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmento           ENABLE ROW LEVEL SECURITY;
ALTER TABLE interacao          ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto            ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_saldo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_movimento  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE funil_etapa        ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidade       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_agenda      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_dominio     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_run            ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_account    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagem           ENABLE ROW LEVEL SECURITY;
ALTER TABLE regua              ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_mensagem  ENABLE ROW LEVEL SECURITY;
ALTER TABLE regua_execucao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_lote        ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_cliente      ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_produto      ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugestao_campanha  ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_run            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documento_gerado   ENABLE ROW LEVEL SECURITY;

-- service_role bypassa RLS (server-side Next.js usa service_role)
-- Policies abaixo sÃ£o para acesso autenticado via JWT (anon role)

-- org: visÃ­vel para usuÃ¡rios da mesma org
CREATE POLICY rls_org ON org
  FOR ALL TO authenticated
  USING (id = current_setting('app.current_org_id', true)::uuid);

-- brand: visÃ­vel para a org corrente
CREATE POLICY rls_brand ON brand
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- app_user
CREATE POLICY rls_app_user ON app_user
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente
CREATE POLICY rls_cliente ON cliente
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente_identidade (via join com cliente)
CREATE POLICY rls_cliente_identidade ON cliente_identidade
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- consentimento
CREATE POLICY rls_consentimento ON consentimento
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- tag
CREATE POLICY rls_tag ON tag
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- cliente_tag (via join)
CREATE POLICY rls_cliente_tag ON cliente_tag
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cliente c
      WHERE c.id = cliente_tag.cliente_id
        AND c.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- segmento
CREATE POLICY rls_segmento ON segmento
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- interacao
CREATE POLICY rls_interacao ON interacao
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- produto
CREATE POLICY rls_produto ON produto
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- estoque_saldo
CREATE POLICY rls_estoque_saldo ON estoque_saldo
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- estoque_movimento: insert-only para usuÃ¡rios; leitura livre dentro da org
CREATE POLICY rls_estoque_movimento_read ON estoque_movimento
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY rls_estoque_movimento_insert ON estoque_movimento
  FOR INSERT TO authenticated
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- pedido
CREATE POLICY rls_pedido ON pedido
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- pedido_item (via join com pedido)
CREATE POLICY rls_pedido_item ON pedido_item
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pedido p
      WHERE p.id = pedido_item.pedido_id
        AND p.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- funil_etapa
CREATE POLICY rls_funil_etapa ON funil_etapa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- oportunidade
CREATE POLICY rls_oportunidade ON oportunidade
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- tarefa
CREATE POLICY rls_tarefa ON tarefa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- evento_agenda
CREATE POLICY rls_evento_agenda ON evento_agenda
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- audit_log: somente leitura para usuÃ¡rios; escrita via service_role
CREATE POLICY rls_audit_log_read ON audit_log
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- evento_dominio
CREATE POLICY rls_evento_dominio ON evento_dominio
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- job_run
CREATE POLICY rls_job_run ON job_run
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- channel_account
CREATE POLICY rls_channel_account ON channel_account
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- conversa
CREATE POLICY rls_conversa ON conversa
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- mensagem (via join com conversa)
CREATE POLICY rls_mensagem ON mensagem
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- regua
CREATE POLICY rls_regua ON regua
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- template_mensagem
CREATE POLICY rls_template_mensagem ON template_mensagem
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- regua_execucao
CREATE POLICY rls_regua_execucao ON regua_execucao
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- import_lote
CREATE POLICY rls_import_lote ON import_lote
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- score_cliente
CREATE POLICY rls_score_cliente ON score_cliente
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- score_produto
CREATE POLICY rls_score_produto ON score_produto
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- insight
CREATE POLICY rls_insight ON insight
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- sugestao_campanha
CREATE POLICY rls_sugestao_campanha ON sugestao_campanha
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- llm_run: somente leitura para usuÃ¡rios
CREATE POLICY rls_llm_run_read ON llm_run
  FOR SELECT TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- documento_gerado
CREATE POLICY rls_documento_gerado ON documento_gerado
  FOR ALL TO authenticated
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 4. CONSTRAINTS CHECK â€” State Machines
-- ---------------------------------------------------------------------------

-- Pedido: status vÃ¡lidos (reforÃ§a o enum no nÃ­vel DB)
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_status CHECK (
    status IN (
      'criado', 'pago', 'separado', 'enviado', 'entregue',
      'avaliacao_solicitada', 'concluido', 'cancelado', 'devolvido'
    )
  );

-- Pedido: total >= 0
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_total_positivo CHECK (total >= 0);

-- Pedido: frete e desconto >= 0
ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_frete_positivo CHECK (frete IS NULL OR frete >= 0);

ALTER TABLE pedido
  ADD CONSTRAINT chk_pedido_desconto_positivo CHECK (desconto IS NULL OR desconto >= 0);

-- Conversa: status vÃ¡lidos
ALTER TABLE conversa
  ADD CONSTRAINT chk_conversa_status CHECK (
    status IN ('nova', 'em_atendimento', 'aguardando_cliente', 'resolvida', 'arquivada')
  );

-- Estoque movimento: quantidade > 0 (nunca zero ou negativo)
ALTER TABLE estoque_movimento
  ADD CONSTRAINT chk_movimento_quantidade_positiva CHECK (quantidade > 0);

-- Score: churn_risk entre 0 e 100
ALTER TABLE score_cliente
  ADD CONSTRAINT chk_churn_risk_range CHECK (churn_risk BETWEEN 0 AND 100);

-- Score produto: risco_encalhe entre 0 e 100
ALTER TABLE score_produto
  ADD CONSTRAINT chk_risco_encalhe_range CHECK (risco_encalhe BETWEEN 0 AND 100);

-- Pedido item: quantidade > 0
ALTER TABLE pedido_item
  ADD CONSTRAINT chk_item_quantidade_positiva CHECK (quantidade > 0);

-- Pedido item: preco_unitario >= 0
ALTER TABLE pedido_item
  ADD CONSTRAINT chk_item_preco_positivo CHECK (preco_unitario >= 0);

-- Produto: preco >= 0
ALTER TABLE produto
  ADD CONSTRAINT chk_produto_preco_positivo CHECK (preco >= 0);

-- Produto: estoque_minimo >= 0
ALTER TABLE produto
  ADD CONSTRAINT chk_produto_estoque_minimo CHECK (estoque_minimo >= 0);

-- LLM run: custo >= 0
ALTER TABLE llm_run
  ADD CONSTRAINT chk_llm_custo_positivo CHECK (custo_usd IS NULL OR custo_usd >= 0);

-- ---------------------------------------------------------------------------
-- 5. CONSTRAINT: estoque_saldo nÃ£o negativo (livro-razÃ£o invariante)
-- ---------------------------------------------------------------------------
-- Nota: a validaÃ§Ã£o primÃ¡ria Ã© feita em cÃ³digo (domain/entities.ts).
-- Este CHECK Ã© a Ãºltima linha de defesa no banco.
ALTER TABLE estoque_saldo
  ADD CONSTRAINT chk_saldo_nao_negativo CHECK (saldo >= 0);

-- ---------------------------------------------------------------------------
-- 6. UNIQUE: idempotÃªncia de mensagens no inbox
-- ---------------------------------------------------------------------------
-- Evita duplicata de mensagem recebida do webhook Z-API
ALTER TABLE mensagem
  ADD CONSTRAINT uq_mensagem_provider UNIQUE (provider_message_id)
  DEFERRABLE INITIALLY DEFERRED;

-- IdempotÃªncia de execuÃ§Ã£o de rÃ©gua (jÃ¡ definida no schema Drizzle como .unique(),
-- mas garantimos explicitamente aqui com nome descritivo)
-- (jÃ¡ existe via Drizzle: regua_execucao.idempotency_key Ã© unique)

-- ---------------------------------------------------------------------------
-- 7. ÃNDICES GIN â€” busca de texto full-text
-- ---------------------------------------------------------------------------

-- Busca de cliente por nome (tsvector)
CREATE INDEX idx_cliente_nome_fts ON cliente
  USING GIN (to_tsvector('portuguese', nome));

-- Busca de cliente por email (pg_trgm para ILIKE rÃ¡pido)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_cliente_email_trgm ON cliente
  USING GIN (email gin_trgm_ops);

CREATE INDEX idx_cliente_telefone_trgm ON cliente
  USING GIN (telefone gin_trgm_ops);

CREATE INDEX idx_cliente_nome_trgm ON cliente
  USING GIN (nome gin_trgm_ops);

-- Busca de produto por nome/sku
CREATE INDEX idx_produto_nome_trgm ON produto
  USING GIN (nome gin_trgm_ops);

CREATE INDEX idx_produto_sku_trgm ON produto
  USING GIN (sku gin_trgm_ops);

-- Busca de conversa por conteÃºdo de mensagem
CREATE INDEX idx_mensagem_conteudo_fts ON mensagem
  USING GIN (to_tsvector('portuguese', conteudo));

-- ---------------------------------------------------------------------------
-- 8. ÃNDICES COMPOSTOS adicionais (performance)
-- ---------------------------------------------------------------------------

-- Pedidos por org + status + data (dashboard principal)
CREATE INDEX idx_pedido_org_status_data ON pedido (org_id, status, criado_em DESC);

-- RÃ©gua execuÃ§Ãµes pendentes (job A8, A9, A10 consultam isso)
CREATE INDEX idx_execucao_pendentes ON regua_execucao (org_id, status, agendada_em)
  WHERE status IN ('elegivel', 'agendada');

-- Score cliente por churn alto (job A10)
CREATE INDEX idx_score_churn_alto ON score_cliente (org_id, churn_risk DESC)
  WHERE churn_risk >= 70;

-- Movimentos por produto + data (livro-razÃ£o)
CREATE INDEX idx_movimento_produto_data ON estoque_movimento (produto_id, criado_em DESC);

-- Consentimento ativo por cliente + brand + finalidade (Gate 1)
CREATE INDEX idx_consentimento_ativo ON consentimento (cliente_id, brand_id, finalidade, status)
  WHERE status = 'ativo';

-- Conversa aberta por org + brand (inbox dashboard)
CREATE INDEX idx_conversa_aberta ON conversa (org_id, brand_id, status, criado_em DESC)
  WHERE status IN ('nova', 'em_atendimento', 'aguardando_cliente');

-- LLM run por org + data (controle de budget mensal)
CREATE INDEX idx_llm_run_budget ON llm_run (org_id, criado_em DESC);

-- SugestÃ£o campanha pendente aprovaÃ§Ã£o
CREATE INDEX idx_sugestao_pendente ON sugestao_campanha (org_id, status, criado_em DESC)
  WHERE status = 'sugerida';

-- ---------------------------------------------------------------------------
-- 9. FUNÃ‡ÃƒO: definir org corrente (usada pelas policies RLS)
-- ---------------------------------------------------------------------------
-- O servidor chama esta funÃ§Ã£o antes de qualquer query autenticada.
-- Exemplo de uso no Next.js:
--   await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`)
CREATE OR REPLACE FUNCTION set_current_org(p_org_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_org_id', p_org_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

