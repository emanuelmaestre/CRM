# RUNBOOK — CRM Plast Leo · Go-Live

> Estado operacional: saneamento em andamento · **não liberado para go-live**
>
> Os checklists abaixo descrevem o estado-alvo. Nenhum disparo externo deve ser habilitado
> antes dos gates de segurança, isolamento de marca e idempotência ficarem verdes.

---

## 1. Pré-requisitos de ambiente

| Variável | Onde configurar | Exemplo |
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
| `E2E_USER_EMAIL` | CI secrets | email do usuário de teste |
| `E2E_USER_PASSWORD` | CI secrets | senha do usuário de teste |

---

## 2. Migração de banco

```bash
# Gerar e aplicar migrações (rodar localmente com DATABASE_URL apontando para prod)
npx drizzle-kit generate
npx drizzle-kit migrate
```

Verificar tabelas críticas após migração:
- `score_cliente` — coluna `versao_formula` com default `v1` (v2 entra no próximo recalculo)
- `documento_gerado` — tabela criada na Fase B, usada ativamente na Fase C
- `llm_run`, `insight`, `sugestao_campanha` — existem desde Fase B

---

## 3. Deploy

```bash
# Via Vercel CLI
vercel --prod

# Ou via GitHub push para main (CI/CD automático)
git push origin main
```

---

## 4. Checklist pós-deploy

### Básico
- [ ] Acessar `https://<domínio>/` → redireciona para login
- [ ] Login com usuário Plast Leo → entra no dashboard
- [ ] Sidebar visível em mobile (375px) e desktop (1280px)

### Módulos
- [ ] `/clientes` — lista, criar, editar cliente
- [ ] `/vendas/pedidos` — criar pedido, confirmar pagamento
- [ ] `/estoque/produtos` — saldo atualizado após pedido pago
- [ ] `/relatorios` — KPIs carregam, tabela de canais visível

### Fase C específico
- [ ] `/relatorios` → botões CSV / XLSX / PDF aparecem (se há dados)
- [ ] Clicar "XLSX" → baixa arquivo `.xlsx` com dados corretos
- [ ] Clicar "PDF" → baixa PDF com tabela de canais
- [ ] Clicar "Documento Executivo IA" → gera resumo (requer `OPENAI_API_KEY`)
- [ ] KPI "Consumo IA (mês)" mostra percentual correto
- [ ] Score RFM de cliente mostra `versao_formula: v2` após próximo recalculo

### Inngest (jobs agendados)
- [ ] Dashboard Inngest → funções visíveis: `scoring/recalcular`, `ia/sugestoes`, `ia/insights`
- [ ] Disparar manualmente `ia/sugestoes` → sugestão aparece em `/relatorios`

### E2E
```bash
E2E_BASE_URL=https://<domínio> E2E_USER_EMAIL=... E2E_USER_PASSWORD=... npx playwright test
```
- [ ] Todos os testes passam em 4 viewports

---

## 5. Rollback

Se qualquer passo falhar:

```bash
# Vercel — promover deployment anterior
vercel rollback

# Banco — nenhuma migração destrutiva foi feita; rollback é seguro
```

---

## 6. Monitoramento

| O quê | Onde |
|---|---|
| Erros de runtime | Vercel → Functions → Logs |
| Consumo OpenAI | KPI "Consumo IA (mês)" em `/relatorios` |
| Jobs Inngest | app.inngest.com → Functions |
| Alertas de churn | Eventos `score.churn_alterado` no log de auditoria |

---

## 7. Treinamento Plast Leo (roteiro 30 min)

1. **Login e navegação** (5 min) — mostrar sidebar, marcas KARZI / WUWU
2. **Cadastro de clientes** (5 min) — criar cliente, adicionar canal
3. **Pedidos e estoque** (5 min) — criar pedido, confirmar, ver baixa de estoque
4. **Relatórios** (10 min):
   - Explicar KPIs
   - Demonstrar export CSV / XLSX / PDF
   - Mostrar "Documento Executivo IA" e quando usar
   - Explicar sugestões de campanha — aprovação obrigatória antes do disparo
5. **Perguntas** (5 min)

---

*Gerado automaticamente — atualizar conforme mudanças de Fase D.*
