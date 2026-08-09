# Estado de Implementação — CRM LEO

Atualizado em 01/08/2026. O `PRD.md` permanece como fonte da verdade dos requisitos. Os arquivos
`fase-a-dod.json` e `fase-b-dod.json` registram evidências verificáveis por fase.

## Regra de liberação

O sistema ainda não está liberado para go-live. `EXTERNAL_SENDS_ENABLED` deve permanecer `false`
até a homologação real dos conectores, do isolamento entre marcas e dos disparos externos.

## Estado atual

| Frente | Estado | Evidência / próximo gate |
|---|---|---|
| Fonte da verdade e baseline | concluída | tipos, lint, testes, migrations e build verdes |
| Segurança, banco e RLS | concluída | migrations até `0018` aplicadas; 34 verificações RLS aprovadas |
| Pedido e estoque | pronta para homologação externa | SLA persistido, status reconciliado, baixa/outbox idempotentes e sync auditável |
| Isolamento de marca | pronta para homologação externa | FK composta, conta/pedido e SKU protegidos por marca; falta ensaio real KARZI × WUWU × Armarinhos Lima |
| Conectores | código verificado; produção bloqueada | ML, Shopee, TikTok v202309 e Olist Partner API testados; faltam contas e credenciais reais |
| CRM operacional (Fase A) | concluída | aceite e evidências em `fase-a-dod.json` |
| Réguas e automações | pronta para homologação externa | seis gates aprovados; outbound real permanece bloqueado |
| Inbox Mercado Livre | pronta para homologação externa | perguntas e pós-venda possuem ingestão e resposta oficial; faltam eventos reais e aceite da conta produtiva |
| Observabilidade | produção bloqueada | painel, A18 e A24 prontos; `/api/inngest` falha sem as chaves de produção |
| IA e lapidação (Fase C) | pronta para homologação externa | gates internos em `fase-c-dod.json`; faltam credenciais, calibração histórica, storage, restore e aceite operacional |

## Evidências atualizadas em 01/08/2026

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem avisos.
- `npm test`: 23 arquivos e 158 testes aprovados.
- `npm run db:check`: aprovado.
- Migrations `0000`–`0018`: migration mais recente aplicada e confirmada no banco Supabase alvo.
- `npm run test:phase-b:integration`: aprovado; 50 tentativas concorrentes produziram 1 mensagem
  e 1 movimento de estoque; coluna de SLA e índice de recuperação do outbox confirmados.
- `npm run test:phase-b:gates`: 6/6 gates aprovados no banco alvo.
- `npm run test:rls`: 34 verificações aprovadas, incluindo isolamento entre tenants e marcas.
- `npm run build`: Next.js 16.2.11 aprovado com 40 páginas geradas.
- `npm run test:phase-b:production`: bloqueado de forma esperada, com diagnóstico explícito das
  credenciais, contas, jobs e provas reais ausentes.
- O seed sintético validou 28 conjuntos em duas execuções idempotentes, com tenant e IDs isolados; o guardrail recusa o tenant operacional em banco remoto.

## Diagnóstico de produção

- Nenhuma conta de marketplace está conectada.
- Existem 8 `channel_account` de marketplace distribuídas entre KARZI, WUWU e Armarinhos Lima;
  todas permanecem desconectadas e Olist ainda não está cadastrado.
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

## Evidências internas da Fase C

- Scoring RFM v2, encalhe v2 com tendência e desconto mínimo v1 possuem fórmula versionada e golden set sintético.
- A integração OpenAI usa Structured Outputs com JSON Schema estrito, validação Zod, uma tentativa de reparo e auditoria por tentativa em `llm_run`.
- Aprovação e rejeição são transições atômicas; sugestões expiradas ou já decididas são recusadas.
- Documento executivo é persistido em PDF ou DOCX; falha no Storage não cria evidência falsa de documento.
- Tipos, lint, 158 testes, build com 40 páginas, migrations, seed idempotente e 34 cenários RLS foram aprovados localmente.
- O E2E autenticado da Fase C foi integrado ao CI em quatro breakpoints e aguarda execução no ambiente com credenciais E2E.
