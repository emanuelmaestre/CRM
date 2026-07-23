# Estado de Implementação — CRM LEO

Atualizado em 23/07/2026. O `PRD.md` permanece como fonte da verdade dos requisitos. Os arquivos
`fase-a-dod.json` e `fase-b-dod.json` registram evidências verificáveis por fase.

## Regra de liberação

O sistema ainda não está liberado para go-live. `EXTERNAL_SENDS_ENABLED` deve permanecer `false`
até a homologação real dos conectores, do isolamento entre marcas e dos disparos externos.

## Estado atual

| Frente | Estado | Evidência / próximo gate |
|---|---|---|
| Fonte da verdade e baseline | concluída | tipos, lint, testes, migrations e build verdes |
| Segurança, banco e RLS | concluída | migration `0013` aplicada; 32 verificações RLS aprovadas |
| Pedido e estoque | pronta para homologação externa | SLA persistido, status reconciliado, baixa/outbox idempotentes e sync auditável |
| Isolamento de marca | pronta para homologação externa | FK composta e resolução por conta/marca; falta ensaio real KARZI × WUWU |
| Conectores | código verificado; produção bloqueada | ML, Shopee, TikTok v202309 e Olist Partner API testados; faltam contas e credenciais reais |
| CRM operacional (Fase A) | concluída | aceite e evidências em `fase-a-dod.json` |
| Réguas e automações | pronta para homologação externa | seis gates aprovados; outbound real permanece bloqueado |
| Inbox unificado | parcial | WhatsApp, ML e TikTok possuem ingestão; faltam eventos reais e homologação oficial por marketplace |
| Observabilidade | produção bloqueada | painel, A18 e A24 prontos; `/api/inngest` falha sem as chaves de produção |
| IA e lapidação (Fase C) | pendente | fora do escopo da Fase B |

## Evidências de 23/07/2026

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem avisos.
- `npm test`: 21 arquivos e 118 testes aprovados.
- `npm run db:check`: aprovado.
- Migrations `0000`–`0013`: migration mais recente aplicada e confirmada no banco Supabase alvo.
- `npm run test:phase-b:integration`: aprovado; 50 tentativas concorrentes produziram 1 mensagem
  e 1 movimento de estoque; coluna de SLA e índice de recuperação do outbox confirmados.
- `npm run test:phase-b:gates`: 6/6 gates aprovados no banco alvo.
- `npm run test:rls`: 32 verificações aprovadas, incluindo isolamento e integridade relacional.
- `npm run build`: Next.js 16.2.11 aprovado com 37 rotas/páginas.
- `npm run test:phase-b:production`: bloqueado de forma esperada, com diagnóstico explícito das
  credenciais, contas, jobs e provas reais ausentes.
- O seed sintético recusou execução no banco remoto de produção, conforme o guardrail de segurança.

## Diagnóstico de produção

- Nenhuma conta de marketplace está conectada.
- Existem apenas `channel_account` de Mercado Livre/KARZI e Shopee/WUWU; TikTok Shop e Olist não
  estão cadastrados.
- Os tokens OAuth do Mercado Livre estão expirados.
- `INNGEST_SIGNING_KEY` e `INNGEST_EVENT_KEY` não estão configuradas; A18/A24 nunca executaram.
- Não há prova recente de pedido real em até cinco minutos, baixa, sincronização remota e inbox
  por canal.

## Gate contratual restante da Fase B

A Fase B só pode ser marcada como concluída após:

1. configurar Inngest e sincronizar o endpoint publicado;
2. conectar as contas reais e cadastrar IDs/mapeamentos por marca;
3. comprovar pedido real de cada canal em até cinco minutos;
4. conferir baixa e saldo remoto ponta a ponta por `estoque.sincronizado`;
5. homologar mensagens/perguntas oficiais dos marketplaces;
6. executar outbound aprovado sem duplicação, mantendo os seis gates ativos.
