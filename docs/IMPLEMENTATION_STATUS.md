# Estado de Implementação — CRM LEO

Atualizado em 21/07/2026. Este documento registra o estado real da implantação; o `PRD.md`
continua sendo a fonte da verdade dos requisitos de produto.

## Regra de liberação

O sistema ainda não está liberado para go-live. Integrações de escrita e disparos externos
permanecem desativados até a conclusão dos gates de segurança, isolamento entre marcas,
idempotência e testes ponta a ponta.

## Fases de saneamento

| Fase | Estado | Gate de saída |
|---|---|---|
| 0 — Fonte da verdade | concluída | documentação e estado oficial coerentes |
| 1 — Baseline técnico | concluída | typecheck, lint, testes e build verdes |
| 2 — Segurança e banco | parcial | migrações prontas; aplicar e testar RLS no banco alvo |
| 3 — Pedido e estoque | parcial | transações/idempotência implementadas; falta teste integrado com Postgres/Inngest |
| 4 — Isolamento de marca | parcial | contas resolvidas por marca; falta homologação cruzada KARZI/WUWU |
| 5 — Conectores | parcial | Mercado Livre persiste itens; Shopee/TikTok/Olist e sync de saldo pendentes |
| 6 — CRM operacional | pendente | rotina diária completa para cada perfil |
| 7 — Réguas e automações | parcial | gates endurecidos e aniversário real; falta homologar providers e retentativas |
| 8 — IA, relatórios e LGPD | pendente | governança e direitos do titular operacionais |
| 9 — Observabilidade e go-live | pendente | E2E, restore e homologação aprovados |

## Evidência obrigatória

Cada fase só muda para concluída quando seus comandos, testes e verificações são registrados
neste documento ou no plano de testes. Código existente sem fluxo verificável continua marcado
como parcial.

## Evidências de 21/07/2026

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem avisos.
- `npm test`: 10 arquivos e 61 testes aprovados.
- `npm run build`: build de produção Next.js 16.2.10 aprovado, com 20 páginas geradas.
- `npm run db:generate`: migração declarativa `0003_schema_integrity.sql` e snapshot gerados.
- Migrações não foram aplicadas automaticamente ao banco alvo; exigem backup, verificação de
  duplicatas e janela controlada conforme o runbook.

## Bloqueios atuais de go-live

- Homologar e completar a recuperação de detalhes de pedidos Shopee e TikTok Shop; implementar Olist.
- Aplicar `0002`/`0003` e executar testes reais de RLS, concorrência e idempotência no Postgres.
- Validar as duas contas por canal e provar que nenhum template, remetente ou link cruza marcas.
- Executar E2E autenticado, teste de restore e ensaio operacional dos jobs/alertas.
- Rotacionar qualquer credencial que tenha sido reutilizada a partir do antigo arquivo de exemplo.
