# CRM LEO — Contexto para Agentes IA

## O que é este projeto
CRM single-tenant multi-marca para Plast Leo (KARZI #E3131B, WUWU #9B30D9, Armarinhos Lima).
Stack: Next.js 16.2 App Router · React 19.2 · TypeScript strict · Drizzle ORM · Supabase · Inngest.
Canais: Mercado Livre, Shopee, TikTok Shop e Olist (Z-API foi removida do projeto).

## Estrutura de módulos
```
src/modules/
  clientes/    — identidade, deduplicação (CPF/email/fone), tags, segmentos
  vendas/      — pedidos (state machine), funil, tarefas, agenda
  estoque/     — livro-razão imutável (só estoqueMovimento altera saldo)
  reguas/      — 6-gate pipeline, templates, importação em lote
  inbox/       — conversas de marketplace (state machine), mensagens idempotentes
  canais/      — providers ML/Shopee/TikTok Shop/Olist, health-check, tokens ML
  scoring/     — RFM determinístico (sem IA), encalhe, churn_risk
  ai/          — AiService central (OpenAI), budget $20/mês, human-in-the-loop
  jobs/        — Inngest A2-A18 (automações durable)
src/shared/
  lib/crud-factory.ts  — factory create/list/getById/update/softDeleteById
  events/index.ts      — 32 domain events via emitirEvento()
  lib/db/schema/       — Drizzle schema completo
```

## Invariante crítica #1
Templates, senders e toda comunicação externa são 100% segregados por brand_id.
Gate 3 da régua verifica: `template.brandId === input.brandId`.

## Onde está o quê
- State machines: `src/modules/vendas/domain/state-machine.ts` e `src/modules/inbox/domain/state-machine.ts`
- 6 gates de régua: `src/modules/reguas/domain/gates.ts`
- Motor de identidade: `src/modules/clientes/domain/identity.ts`
- Livro-razão: `src/modules/estoque/domain/entities.ts`
- Design system CSS: `src/app/globals.css`
- Schema DB: `src/shared/lib/db/schema/`
- Testes: `src/**/*.test.ts` (Vitest + jsdom)
