# RUNBOOK — CRM LEO

## Deploy

### Pré-requisitos
- Node.js 20+, npm 10+
- Supabase project configurado
- Inngest account (dashboard.inngest.com)
- Z-API instâncias ativas para KARZI e WUWU

### Variáveis de ambiente obrigatórias
```env
DATABASE_URL=postgresql://...        # Supabase connection string
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
INNGEST_SIGNING_KEY=signkey-prod-...
INNGEST_EVENT_KEY=...
OPENAI_API_KEY=sk-...
DEFAULT_ORG_ID=uuid-da-org
ZAPI_INSTANCE_KARZI=...
ZAPI_TOKEN_KARZI=...
ZAPI_INSTANCE_WUWU=...
ZAPI_TOKEN_WUWU=...
ZAPI_WEBHOOK_TOKEN=...              # Valida x-api-token no webhook
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Deploy Vercel
```bash
vercel deploy --prod
```

### Após deploy
1. Verificar webhook Z-API aponta para `https://<domínio>/api/webhooks/zapi`
2. Registrar funções Inngest: `https://<domínio>/api/inngest`
3. Testar saúde: `GET /api/health`

---

## Backup e Restore

### Backup automático
Supabase faz backup diário (Point-in-Time Recovery disponível no plano Pro).

### Backup manual
```bash
supabase db dump --db-url $DATABASE_URL -f backup-$(date +%Y%m%d).sql
```

### Restore
```bash
psql $DATABASE_URL < backup-YYYYMMDD.sql
```

### Dados críticos para preservar
- Tabela `estoque_movimento` — livro-razão imutável, base de auditoria
- Tabela `audit_log` — trilha de auditoria compliance
- Tabela `consentimento` — LGPD, não pode ser perdida

---

## Incidentes

### WhatsApp parou de receber mensagens
1. Verificar `GET /api/health` → campo `canais`
2. Checar Z-API dashboard: instância conectada?
3. Se desconectada: reconectar via QR code no Z-API dashboard
4. Validar webhook: curl `POST /api/webhooks/zapi` com payload de teste
5. Ver logs Inngest: jobs A18 (saúde-conectores) registram histórico

### Scores não estão atualizando
1. Verificar Inngest dashboard → funções A13, A14 rodando às 2h
2. Checar `job_run` no DB: `SELECT * FROM job_run WHERE nome LIKE 'A13%' ORDER BY created_at DESC LIMIT 5`
3. Se falhar: disparar manualmente via Inngest dashboard → "Invoke"

### IA não gera insights
1. Consultar consumo: `SELECT SUM(custo_usd) FROM llm_run WHERE created_at > NOW() - INTERVAL '30 days'`
2. Se próximo de $20: budget cortou automaticamente — reset manual no início do mês
3. Checar `OPENAI_API_KEY` válida

### Mensagem duplicada enviada
- Sistema usa `idempotency_key` e `provider_message_id` — duplicatas são bloqueadas
- Investigar: `SELECT * FROM regua_execucao WHERE idempotency_key = '...'`
- Se regra disparou mais de uma vez: verificar Gate 4 no código `src/modules/reguas/domain/gates.ts`

### Estoque negativo detectado
- Cron A5 roda às 3h e emite evento `estoque.divergencia_detectada`
- Verificar `evento_dominio` no DB pelo tipo acima
- Investigar movimentos: `SELECT * FROM estoque_movimento WHERE produto_id = '...' ORDER BY created_at`
- Nunca corrigir saldo diretamente — inserir movimento de ajuste com `tipo = 'ajuste'`

---

## Rotinas Operacionais

### Diário (automático via Inngest)
| Horário | Job | Ação |
|---------|-----|------|
| 02:00 | A13, A14 | Recalcula scores RFM de clientes e encalhe de produtos |
| 03:00 | A5 | Reconciliação de saldo (detecta negativos) |
| 09:00 | A9 | Dispara régua de aniversário |
| 10:00 seg-sex | A10 | Dispara régua de reativação (churn ≥ 70) |
| */15min | A18 | Health-check conectores Z-API |

### Semanal (automático via Inngest)
| Horário | Job | Ação |
|---------|-----|------|
| segunda 07:00 | A15 | Insight executivo do funil (IA) |
| segunda 08:00 | A16 | Sugestões de campanha (IA, requer aprovação humana) |

### Mensal (manual)
1. Revisar consumo IA: dashboard Inngest + tabela `llm_run`
2. Aprovar/rejeitar sugestões de campanha pendentes: tabela `sugestao_campanha`
3. Verificar advisors Supabase: checar índices faltantes ou queries lentas
4. Revisar clientes sem opt-in expirados (`consentimento.validade_ate < NOW()`)

---

## Migração de Fornecedor

### Trocar Z-API por outro provider WhatsApp
1. Criar novo provider em `src/modules/canais/infrastructure/<novo>.provider.ts` implementando `MessagingProvider`
2. Atualizar `criarZApiProvider()` → `criarProvider()` em `saude.service.ts`
3. Atualizar variáveis de ambiente
4. Testar com conta de sandbox antes de migrar produção

### Trocar OpenAI por outro LLM
1. `src/modules/ai/application/ai.service.ts` — atualizar cliente e modelo
2. `src/modules/ai/domain/guardrails.ts` — atualizar `MODELOS` e cálculo de custo
3. Manter validação Zod nos outputs (obrigatório para confiabilidade)

### Migrar de Supabase
1. `supabase db dump` completo
2. Ajustar `DATABASE_URL` para nova instância
3. Recriar RLS policies (arquivo `supabase/migrations/`)
4. Recriar triggers `set_updated_at`
