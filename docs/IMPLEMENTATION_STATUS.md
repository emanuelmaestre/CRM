# Estado de Implementação — CRM LEO

Atualizado em 09/08/2026. O `PRD.md` permanece como fonte da verdade dos requisitos. Os arquivos
`fase-a-dod.json`, `fase-b-dod.json` e `fase-c-dod.json` registram evidências verificáveis por fase.

Foco atual de homologação: **Mercado Livre**. Shopee e TikTok Shop têm código de provider/webhook
pronto e testado, mas a conexão e homologação real desses dois canais foi adiada para uma fase
futura — não contam mais como pendência ativa deste ciclo.

## Regra de liberação

O sistema ainda não está liberado para go-live. `EXTERNAL_SENDS_ENABLED` deve permanecer `false`
até a homologação real dos conectores, do isolamento entre marcas e dos disparos externos.

## Estado atual

| Frente | Estado | Evidência / próximo gate |
|---|---|---|
| Fonte da verdade e baseline | concluída | tipos, lint, 216 testes, migrations e build verdes; CI verde (`Types · Lint · Tests · Migrations`, `E2E Fase A · 4 breakpoints`, `Build check`) |
| Segurança, banco e RLS | concluída | migrations até `0021` aplicadas; RLS de `estoque_divergencia` habilitada |
| Pedido e estoque | pronta para homologação externa | SLA persistido, status reconciliado, baixa/outbox idempotentes e sync auditável; **gap operacional aberto**: catálogo interno de produtos por marca está muito aquém do catálogo real do Mercado Livre (ex.: WUWU tem 175 anúncios ativos no ML e poucos produtos mapeados no CRM), causando falhas recorrentes do job A24 em pedidos com SKU não cadastrado |
| Isolamento de marca | pronta para homologação externa | FK composta, conta/pedido e SKU protegidos por marca; falta ensaio real KARZI × WUWU × Armarinhos Lima |
| Conectores — Mercado Livre | **conectado e operando** | as três contas (KARZI, WUWU, Armarinhos Lima) estão com status `conectado` e token válido; renovação automática pelo job A23 confirmada em execução real |
| Conectores — Shopee / TikTok Shop | código verificado; conexão adiada | providers e webhooks testados; sem credenciais reais configuradas (status `degradado` no health-check) — fora do foco atual por decisão de produto |
| CRM operacional (Fase A) | concluída | aceite e evidências em `fase-a-dod.json` |
| Réguas e automações | pronta para homologação externa | seis gates aprovados; outbound real permanece bloqueado por `EXTERNAL_SENDS_ENABLED=false` |
| Inbox Mercado Livre | pronta para homologação externa | os três tipos oficiais de mensagem (pós-venda, perguntas pré-venda, mensagem de reclamação) têm ingestão e resposta reais no código; falta homologação com volume real de eventos |
| Observabilidade / Inngest | **rodando em produção** | `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` configuradas; A18 (saúde de conectores), A23 (refresh de token ML) e A24 (polling de pedidos) confirmados em execução real via `job_run` (centenas de execuções cada) |
| IA (Fase C) | configurada, uso inicial | `OPENAI_API_KEY` configurada; ao menos 1 execução real bem-sucedida registrada em `llm_run`; falta calibração histórica, volume de uso real e aceite operacional |
| Documentos / Storage | produção bloqueada | geração de PDF/DOCX implementada; bucket `documentos` e URLs assinadas ainda não homologados no ambiente alvo |

## Evidências atualizadas em 09/08/2026

- `npm run typecheck`: aprovado.
- `npm test`: 29 arquivos e 216 testes aprovados.
- CI (`gh run view`, run mais recente no `main`): os três jobs (`Types · Lint · Tests · Migrations`,
  `E2E Fase A · 4 breakpoints`, `Build check`) aprovados — incluindo, pela primeira vez em vários
  commits, o gate de E2E da Fase C (`relatorios-export.spec.ts`, `sugestao-aprovacao-disparo.spec.ts`),
  que estava mascarado por uma falha anterior no gate de Fase B.
- Migrations até `0021` aplicadas no banco Supabase alvo (RLS de `estoque_divergencia` incluída).
- Verificação direta no banco alvo (somente leitura, sem expor segredos):
  - `channel_account` Mercado Livre das três marcas com `status = 'conectado'`.
  - `canal_tokens` do Mercado Livre com `expires_at` futuro nas três marcas (renovação automática
    confirmada).
  - `job_run`: A18, A23 e A24 com centenas de execuções `concluido` recentes — Inngest real está
    ativo, não bloqueado.
  - `llm_run`: 1 execução real registrada com sucesso — integração OpenAI funcional.
  - Gap identificado: job A24 vem falhando repetidamente (a cada ciclo de 4 min) para a conta
    Mercado Livre WUWU por um pedido real com SKU (`W939`) sem produto cadastrado no CRM — sintoma
    do catálogo interno incompleto frente ao catálogo real do canal.

## Diagnóstico de produção

- Mercado Livre: três contas conectadas (KARZI, WUWU, Armarinhos Lima), tokens válidos, renovação
  automática ativa. **Não é mais bloqueio.**
- Inngest: chaves de produção configuradas; A18/A23/A24 rodando no cron real. **Não é mais bloqueio.**
- OpenAI: chave configurada, uso real já comprovado (baixo volume). **Não é mais bloqueio de
  conectividade**, mas falta calibração/volume para aceite operacional pleno.
- Shopee, TikTok Shop: sem credenciais reais — fora do escopo ativo por decisão de produto (fase
  futura), não é mais tratado como pendência do ciclo atual.
- Catálogo de produtos: desatualizado frente ao catálogo real do Mercado Livre por marca — bloqueia
  ingestão de pedidos com SKU ainda não mapeado (ver evidência do job A24 acima).
- Storage (`documentos`) e ensaio de restore de backup: ainda não homologados no ambiente alvo.

## Gate contratual restante da Fase B

A Fase B só pode ser marcada como concluída após:

1. completar o mapeamento produto/listing/SKU do Mercado Livre por marca, eliminando as falhas de
   ingestão por SKU não cadastrado;
2. comprovar pedido real do Mercado Livre em até cinco minutos sem falha (SLA já medido, falta
   corrida limpa);
3. conferir baixa e saldo remoto ponta a ponta por `estoque.sincronizado`;
4. homologar mensagens/perguntas oficiais do Mercado Livre com volume real;
5. executar outbound aprovado sem duplicação, mantendo os seis gates ativos.

Shopee e TikTok Shop saem deste gate — passam a ser tratados em uma fase própria, futura.

## Evidências internas da Fase C

- Scoring RFM v2, encalhe v2 com tendência e desconto mínimo v1 possuem fórmula versionada e golden set sintético.
- A integração OpenAI usa Structured Outputs com JSON Schema estrito, validação Zod, uma tentativa de reparo e auditoria por tentativa em `llm_run`.
- Aprovação e rejeição são transições atômicas; sugestões expiradas ou já decididas são recusadas.
- Documento executivo é persistido em PDF ou DOCX; falha no Storage não cria evidência falsa de documento.
- Tipos, lint, 216 testes, build, migrations e RLS aprovados localmente; E2E de Fase C validado no CI em quatro breakpoints (relatórios, aprovação humana de sugestão).
