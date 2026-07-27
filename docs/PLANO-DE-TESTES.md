# Plano de Testes - CRM LEO

Este plano transforma a secao 18 do PRD em uma matriz executavel de qualidade.

## Comandos Base

| Gate | Comando |
|---|---|
| Tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Unidade/dominio | `npx vitest run --maxWorkers=1` |
| Build | `npm run build` |
| Responsividade autenticada | `npx playwright test e2e/navegacao-responsiva.spec.ts` |
| Fase A E2E | `npm run test:e2e:phase-a` |
| Fase B E2E | `npm run test:e2e:phase-b` |
| Fase C E2E | `npm run test:e2e:phase-c` |
| RLS | `npm run test:rls` |
| Fase B integrada | `npm run test:phase-b:integration` |
| Gates de regua | `npm run test:phase-b:gates` |
| Producao fase B | `npm run test:phase-b:production` |

## Cobertura Obrigatoria por Invariante

| Invariante | Cobertura |
|---|---|
| Sigilo KARZI/WUWU | Testes de gates, provider account por marca, mapeamento SKU por marca e RLS. |
| Sem envio sem opt-in | `reguas-gates`, `phase-b-gates.integration`. |
| Cliente marketplace nao sai do canal | Gate de canal de origem e provider oficial. |
| IA nao dispara nem altera preco/estoque | `guardrails-ia.test.ts` e fluxo de aprovacao. |
| Idempotencia de mensagem | Teste integrado de concorrencia da Fase B. |
| Estoque por livro-razao | `estoque.test.ts` e A2/A3/A4. |
| Estado por maquina documentada | `state-machine.test.ts`, `order-status-mapping.test.ts`. |
| Falha visivel | `job-monitor`, painel `/admin/saude`, `job_run`. |
| Sem segredo em log | Revisao de providers, painel de saude e API contracts. |
| Vendedor sem custo/margem | RLS e autorizacao. |
| Backup/exportacao possivel | A20, RUNBOOK e fluxo LGPD. |

## Matriz por Modulo

| Modulo | Testes minimos |
|---|---|
| M1 Clientes 360 | CRUD, dedupe, timeline, tags, consentimento, exportacao LGPD. |
| M2 Estoque | Movimento, saldo, minimo, sync, reconciliacao, SKU x anuncio. |
| M3 Conectores | Assinatura webhook, polling, normalizacao, health, retry. |
| M4 Reguas | 6 gates, idempotencia, opt-out, bloqueios auditados. |
| M5 IA | structured outputs, custo, guardrails, aprovacao humana. |
| M6 Relatorios | PDF/XLSX/CSV, filtros, dashboard real. |
| M7 Segurança/Importacao | RLS, perfis, importacao com previa, LGPD. |

## Responsividade

Telas chave devem passar nos breakpoints oficiais:

- 360 px
- 768 px
- 1024 px
- 1920 px

O teste deve bloquear dialog de erro real (`[data-nextjs-dialog]`) e console error de aplicacao.

## Evals de IA

- Manter goldenset sintetico versionado.
- Rodar evals antes de trocar prompt/modelo.
- Bloquear regressao quando sugestoes aprovaveis virarem invalidas ou sem fonte numerica.

## Go-live

Antes de liberar `EXTERNAL_SENDS_ENABLED=true`:

1. executar pedido real por canal;
2. comprovar baixa e sincronizacao remota;
3. comprovar inbox real por marketplace;
4. executar A18/A24/A20 em ambiente conectado;
5. validar backup/restore no RUNBOOK;
6. assinar checklist de aceite.
