# Arquitetura — CRM LEO

## Visão geral

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 16.2 App Router (Vercel)                       │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │  Pages  │  │ API Route│  │  Inngest Functions     │ │
│  │  /app   │  │  /api    │  │  A2-A18 (durable jobs) │ │
│  └────┬────┘  └────┬─────┘  └────────────┬───────────┘ │
│       │            │                      │             │
│  ┌────▼────────────▼──────────────────────▼───────────┐ │
│  │           Módulos (Clean Architecture)              │ │
│  │  clientes · vendas · estoque · reguas · inbox      │ │
│  │  canais · scoring · ai                             │ │
│  └────────────────────────────┬───────────────────────┘ │
│                               │                         │
│  ┌────────────────────────────▼───────────────────────┐ │
│  │  Shared                                            │ │
│  │  crud-factory · domain events · db schema          │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │                    │                │
    Supabase            Inngest Cloud      Z-API (WhatsApp)
    (Postgres+RLS)      (job orchestration) (uma instância por operação)
         │
    Upstash Redis       OpenAI API
    (cache/rate-limit)  (gpt-4.1 / gpt-4.1-mini)
```

## Clean Architecture por módulo

```
src/modules/<modulo>/
  domain/        ← entidades, value objects, state machines, regras puras
  application/   ← serviços, use cases, orquestradores
  infrastructure/← providers externos (DB, Z-API, OpenAI)
  ui/            ← componentes React específicos do módulo
```

**Regra de dependência:** domínio não importa application; application não importa infrastructure.
Comunicação entre módulos apenas via eventos de domínio (`emitirEvento`) ou serviços tipados.

## CRUD Factory

`src/shared/lib/crud-factory.ts` — gera automaticamente para qualquer entidade Drizzle:
- `create` — valida Zod, escopa org_id, registra audit_log
- `getById` — filtra org_id + deletedAt
- `list` — paginação cursor, filtros, org_id
- `update` — valida Zod, registra diff no audit_log
- `softDeleteById` — seta deletedAt, não apaga do DB

## Isolamento multi-marca

KARZI, WUWU e Armarinhos Lima compartilham o tenant administrativo atual (`org_id`) e mantêm
fronteiras operacionais independentes por `brand_id`.
Isolamento garantido por `brand_id` em:
- Templates de mensagem
- Instâncias Z-API (1 por marca)
- Gate 3 da régua (invariante crítica #1)
- Senders externos

## Fluxo de evento de domínio

```
[serviço de aplicação]
       │
       ▼ emitirEvento({ tipo, orgId, entidadeId, payload })
[shared/events/index.ts]
       │ INSERT evento_dominio
       │ Inngest.send() → topic no Inngest Cloud
       ▼
[src/modules/jobs/A*.ts]  — handler Inngest durable
       │ step.run() com retry automático
       ▼
[efeito colateral] (baixa estoque, dispara régua, etc.)
```

## Banco de dados

- **ORM:** Drizzle
- **DB:** Supabase Postgres
- **RLS:** habilitado em todas as tabelas; service_role apenas server-side
- **Soft delete:** `deletedAt timestamp` em entidades principais
- **Auditoria:** `audit_log` insert-only; `evento_dominio` para rastreio de eventos
- **Livro-razão:** `estoque_movimento` é imutável; saldo derivado de movimentos
