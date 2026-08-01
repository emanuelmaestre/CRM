# RUNBOOK — CRM Plast Leo · Operação

> Estado: **pré-go-live** · nenhum disparo externo habilitado até os gates de segurança, isolamento de marca e idempotência ficarem verdes.

---

## 1. Variáveis de ambiente

| Variável | Onde configurar | Observação |
|---|---|---|
| `DATABASE_URL` | Vercel → Settings → Env Vars | `postgres://user:pass@host/db` |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (secret) | `eyJ...` |
| `OPENAI_API_KEY` | Vercel (secret) | `sk-...` |
| `INNGEST_EVENT_KEY` | Vercel | `inngest_...` |
| `INNGEST_SIGNING_KEY` | Vercel (secret) | `signkey-...` |
| `UPSTASH_REDIS_REST_URL` | Vercel | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel (secret) | `AX...` |
| `DEFAULT_ORG_ID` | Vercel (secret) | UUID do tenant administrativo das três operações |
| `SYNTHETIC_SEED_ORG_ID` | Apenas dev/staging | UUID exclusivo do tenant sintético; nunca igual ao `DEFAULT_ORG_ID` em banco remoto |
| `BRAND_ID_KARZI` | Vercel (secret) | UUID da brand KARZI |
| `BRAND_ID_WUWU` | Vercel (secret) | UUID da brand WUWU |
| `BRAND_ID_ARMARINHOS_LIMA` | Vercel (secret) | UUID da brand Armarinhos Lima |
| `PROVISION_SECRET` | Vercel (secret) | Token de bootstrap inicial |
| `E2E_USER_EMAIL` | CI secrets | E-mail do usuário de teste |
| `E2E_USER_PASSWORD` | CI secrets | Senha do usuário de teste |

---

## 2. Primeiro boot — provisionamento

Execute **uma única vez** após o primeiro deploy:

```bash
curl -X POST https://<domínio>/api/provision \
  -H "x-provision-secret: $PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email": "emanuelmaestre1@gmail.com"}'
```

Isso cria: tenant administrativo · brands KARZI, WUWU e Armarinhos Lima · usuário admin.

---

## 3. Migração de banco

```bash
# Gerar e aplicar migrações (rodar localmente com DATABASE_URL apontando para prod)
npx drizzle-kit generate
npx drizzle-kit migrate
```

Verificar após migração:
- `score_cliente` — coluna `versao_formula` default `v1`
- `documento_gerado` — criada na Fase B
- `llm_run`, `insight`, `sugestao_campanha` — existem desde Fase B
- `consentimento` — presente em schema clientes

---

## 4. Deploy

```bash
# Via Vercel CLI
vercel --prod

# Ou via GitHub push para main (CI/CD automático)
git push origin main
```

---

## 5. Catálogo de automações A1–A22

| ID | Nome | Gatilho | Cadência |
|---|---|---|---|
| A1 | Ingestão de pedidos | `canal/pedido.recebido` | Por evento |
| A2 | Baixa de estoque | `pedido.confirmado` | Por evento |
| A3 | Estorno de estoque | `pedido.cancelado` | Por evento |
| A4 | Sync de saldo nos canais | `estoque/saldo.atualizado` | Por evento |
| A5 | Reconciliação de saldo | Cron | Diária 01h |
| A6 | Alerta de estoque mínimo | `estoque/saldo.atualizado` | Por evento |
| A7 | Detecção de encalhe | Cron | Diária 02h |
| A8 | Régua de avaliação | `pedido.entregue` | Por evento |
| A9 | Régua de aniversário | Cron | Diária 09h |
| A10 | Régua de reativação | Cron | Semanal seg 10h |
| A11 | Cancelar opt-out | `cliente.optout_solicitado` | Por evento |
| A12 | Conversa parada >24h | Cron | De hora em hora |
| A13 | Scores RFM + churn cliente | Cron | Diária 03h |
| A14 | Scores de produto | Cron | Diária 04h |
| A15 | Insights de funil (IA) | Cron | Semanal dom 05h |
| A16 | Sugestões de campanha (IA) | Cron | Semanal dom 06h |
| A17 | Documentos executivos (IA) | `ia/documento.solicitado` | Por evento |
| A18 | Saúde dos conectores | Cron | A cada 15 min |
| A19 | Notificações internas | Cron | Diária 08h |
| A20 | Verificação de backup | Cron | Diária 04h |
| A21 | Monitoramento consumo IA | Cron | A cada 6h |
| A22 | Retenção LGPD (anonimização) | Cron | Mensal dia 1, 03h |

Para disparar um job manualmente (staging ou diagnóstico):
```
Inngest Cloud → Functions → <nome> → Send Event → preencher payload
```

---

## 6. Checklist pós-deploy

### Básico
- [ ] `https://<domínio>/` → redireciona para login
- [ ] Login com usuário Plast Leo → dashboard carrega
- [ ] Sidebar visível em mobile (375 px) e desktop (1280 px)
- [ ] PWA: "Adicionar à tela inicial" disponível no Chrome mobile

### Módulos
- [ ] `/clientes` — lista, criar, editar cliente; validação CPF/CNPJ funciona
- [ ] `/vendas/pedidos` — criar pedido, confirmar pagamento, ver KPIs
- [ ] `/estoque/produtos` — saldo atualizado após pedido pago
- [ ] `/inbox` — abas Conversas e Perguntas carregam

### Relatórios e IA
- [ ] `/relatorios` — KPIs carregam, tabela de canais visível
- [ ] Botões CSV / XLSX / PDF aparecem e baixam arquivo correto
- [ ] "Documento Executivo IA" gera resumo (requer `OPENAI_API_KEY`)
- [ ] KPI "Consumo IA (mês)" mostra percentual correto

### Inngest
- [ ] Dashboard Inngest → todas as 22 funções visíveis
- [ ] A18 (saúde conectores) rodando; nenhum canal marcado `degradado`
- [ ] A13 (scores) executou pelo menos uma vez; `score_cliente` tem linhas

### E2E
```bash
E2E_BASE_URL=https://<domínio> \
E2E_USER_EMAIL=... \
E2E_USER_PASSWORD=... \
npx playwright test
```
- [ ] Todos os testes passam nos 4 viewports

### Seed sintético isolado

Em banco remoto de desenvolvimento, staging ou preview, defina um tenant exclusivo e mantenha os envios externos desativados:

```bash
SYNTHETIC_SEED_ENV=staging \
SYNTHETIC_SEED_REMOTE_CONFIRMATION=seed-synthetic-data \
SYNTHETIC_SEED_ORG_ID=<uuid-diferente-do-DEFAULT_ORG_ID> \
npm run test:seed-synthetic
```

O comando é bloqueado em produção e também quando o tenant sintético coincide com o tenant operacional.

### Observabilidade da aplicação
- `/admin/saude` lista o estado real dos conectores e as execuções recentes de jobs.
- Falhas definitivas de jobs e eventos operacionais aparecem na fila de falhas do painel.
- Erros de renderização emitem JSON estruturado com `timestamp`, `level`, `event` e `digest`.
- Para correlacionar uma falha reportada pela UI, pesquise o `digest` nos logs da Vercel.

---

## 7. Backup e restore

### Política
| Métrica | Alvo |
|---|---|
| RPO (perda máxima de dados) | 24 h |
| RTO (tempo máximo de restauração) | 4 h |

### Como funciona
- Supabase gerencia backups diários automáticos (Point-in-Time Recovery nos planos Pro+).
- O job A20 roda às 04h, verifica conectividade e emite `backup.executado` ou `backup.falhou` no log de auditoria.
- Se `backup.falhou` aparecer dois dias seguidos → abrir incidente P1.

### Restore (Supabase Dashboard)
1. Supabase → Project → Settings → Backups
2. Selecionar ponto de restauração (≤ RPO 24 h)
3. Clicar "Restore" → aguardar 15–30 min
4. Após restore, reexecutar `npx drizzle-kit migrate` se houver migrações novas
5. Verificar checklist §6 completo antes de liberar tráfego

---

## 8. Resposta a incidentes

### Classificação
| Prioridade | Critério | SLA de resposta |
|---|---|---|
| P1 — Crítico | Sistema inacessível ou dados corrompidos | 30 min |
| P2 — Alto | Módulo principal indisponível (pedidos, estoque) | 2 h |
| P3 — Médio | Funcionalidade secundária degradada | 8 h |
| P4 — Baixo | Cosmético ou melhoria | Próximo sprint |

### Procedimento (4 passos)
1. **Detectar** — alertas via Inngest, Vercel Logs, ou relato de usuário. Registrar hora e sintoma.
2. **Isolar** — identificar componente afetado (API, job, banco, canal externo). Verificar `/admin/saude`.
3. **Conter** — desabilitar canal afetado (`canal.degradado`) se necessário; `vercel rollback` se o deploy causou a falha.
4. **Resolver e documentar** — aplicar fix, reexecutar checklist §6, registrar causa raiz e ação corretiva.

### Rollback rápido
```bash
vercel rollback
```
Banco: nenhuma migração destrutiva foi aplicada; rollback de schema é seguro com `drizzle-kit migrate` no commit anterior.

---

## 9. Rotinas operacionais

### Diária (responsável: Emanuel)
- [ ] Verificar `/admin/saude` — todos os conectores verdes
- [ ] Revisar inbox — responder conversas paradas (A12 alerta após 24 h)
- [ ] Checar KPI "Consumo IA (mês)" em `/relatorios` — se > 80 %, investigar

### Semanal (toda segunda-feira)
- [ ] Revisar sugestões de campanha (A16) em `/relatorios` — aprovar ou descartar
- [ ] Verificar scores de churn — clientes com `risco_churn >= 70` → ação manual
- [ ] Checar log de auditoria por eventos `backup.falhou` ou `canal.degradado`

### Mensal (primeiro dia útil)
- [ ] Confirmar que A22 (LGPD) rodou — ver `importacao.concluida` com `tipo: lgpd_anonimizacao` no log
- [ ] Revisar insights de funil (A15) — repassar ao time comercial
- [ ] Verificar consumo OpenAI — ajustar orçamento em `ai.service` se necessário
- [ ] Exportar relatório mensal em XLSX para arquivo

---

## 10. Monitoramento

| O quê | Onde |
|---|---|
| Erros de runtime | Vercel → Functions → Logs |
| Consumo OpenAI | KPI "Consumo IA (mês)" em `/relatorios` |
| Jobs Inngest | app.inngest.com → Functions |
| Saúde dos conectores | `/admin/saude` |
| Alertas de churn | Eventos `score.churn_alterado` no log de auditoria |
| Backup | Eventos `backup.executado` / `backup.falhou` no log |
| LGPD | Eventos `importacao.concluida (tipo: lgpd_anonimizacao)` mensais |

---

## 11. Treinamento Plast Leo (roteiro 30 min)

1. **Login e navegação** (5 min) — sidebar, marcas KARZI / WUWU / Armarinhos Lima
2. **Cadastro de clientes** (5 min) — criar cliente, validar CPF/CNPJ, adicionar canal WhatsApp
3. **Pedidos e estoque** (5 min) — criar pedido, confirmar, ver baixa de estoque
4. **Relatórios** (10 min):
   - KPIs e filtros
   - Export CSV / XLSX / PDF
   - "Documento Executivo IA" — quando usar
   - Sugestões de campanha — **aprovação obrigatória antes do disparo**
5. **Perguntas** (5 min)

---

## 12. Rollout Fase D (futuro)

Itens fora do escopo contratual atual (Plano Acelera):
- Integração Shopify / WooCommerce
- Multi-tenant (múltiplos clientes além de Plast Leo)
- App mobile nativo (React Native)
- BI avançado com drill-down por SKU

---

*Última atualização: 2026-08-01 · Fase A concluída; Fases B + C prontas para homologação externa.*
