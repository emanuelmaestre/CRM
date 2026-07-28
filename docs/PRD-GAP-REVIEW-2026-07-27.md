# Revisao PRD x Implementacao - 2026-07-27

Este arquivo registra a revisao local feita contra o PRD do CRM LEO e o que foi implantado neste ciclo.

## Implantado neste ciclo

- Configuracoes passou a exibir uma matriz real de canais por marca:
  - status de conta cadastrada/conectada;
  - quantidade de SKUs mapeados por conta;
  - ultima verificacao;
  - erro recente;
  - variaveis de ambiente ausentes por canal/marca, sem expor valores de segredo.
- Build deixou de depender de fetch externo do Google Fonts. O layout agora usa variaveis CSS com fallback local para `Inter` e `Sora`, evitando falha offline/intermitente no `next build`.
- Dashboard executivo deixou de depender de dados simulados e passou a consumir dados reais do banco:
  - receita dos ultimos 30 dias;
  - curva dos ultimos 14 dias;
  - pedidos de hoje;
  - clientes recentes;
  - pedidos recentes;
  - SKUs em alerta por estoque minimo;
  - canais cadastrados/conectados e canais prioritarios pendentes.
- Painel `/admin/saude` ganhou checklist de prontidao para go-live:
  - ambiente base;
  - Inngest;
  - OpenAI;
  - envios externos;
  - contas de canal;
  - jobs A18/A24;
  - storage de documentos;
  - backup/restore.
- Backup deixou de ser apenas texto estatico no painel de saude e passou a refletir a ultima execucao de `A20-backup-verificacao`, quando existir.
- Ficha 360 de clientes ganhou controles LGPD seguros:
  - exportar pacote JSON com dados do cliente, timeline, pedidos, tarefas, consentimentos e tags;
  - revogar consentimento ativo com auditoria e evento de dominio.
- A revogacao de consentimento passou a exigir perfil `admin` ou `gestor`.
- Configuracoes de canais ganhou operacao local completa para a proxima fase:
  - cadastro de `channel_account` por marca e canal, sem armazenar token em tela;
  - validacao de duplicidade por org/marca/tipo;
  - `vault_key` padronizado para apontar para variaveis/segredos externos;
  - auditoria de cadastro de conta de canal;
  - mapeamento SKU interno x anuncio/listing por conta de canal;
  - bloqueio de mapeamento entre produto e conta de marcas diferentes;
  - exigencia de SKU externo e warehouse para TikTok Shop;
  - revalidacao de `/configuracoes`, `/admin/saude` e `/estoque` apos mudancas.
- Documentacao viva obrigatoria do PRD foi criada:
  - `docs/API_CONTRACTS.md`;
  - `docs/PLANO-DE-TESTES.md`;
  - `docs/RUNBOOK.md`;
  - `docs/DECISOES/ADR-001-monolito-modular.md`.
- LGPD administrativa foi implementada em codigo:
  - schema e migration `0014_lgpd_solicitacoes.sql`;
  - tabela `lgpd_solicitacao` com RLS por `org_id` e relacao com cliente;
  - service para abrir, listar, concluir exportacao, rejeitar e anonimizar solicitacoes;
  - rota `/admin/lgpd` com fila, download JSON e confirmacao textual `ANONIMIZAR`;
  - link operacional em `/configuracoes`;
  - fallback visual quando a migration ainda nao foi aplicada no banco conectado.
- Dashboard executivo foi ampliado conforme a secao 10 do PRD:
  - filtros por periodo, marca e canal;
  - receita, pedidos e curva respeitando filtros reais;
  - conversao, ticket medio e receita por canal;
  - responsaveis do funil com valor de oportunidades;
  - bloqueios de reguas por gate/motivo;
  - consumo de IA por custo, runs e taxa de sucesso;
  - observacao explicita de que pedido ainda nao guarda vendedor direto, entao o painel usa funil por responsavel.
- Configuracoes de canais ganhou edicao e remocao de `channel_account` com regra de impacto (item 3 da secao de lacunas):
  - `atualizarContaCanalConfiguracao` edita nome/ID externo com auditoria antes/depois;
  - `removerContaCanalConfiguracao` bloqueia exclusao quando existem mapeamentos de SKU, pedidos historicos ou conversas de inbox vinculados a conta, com mensagem explicita do impedimento;
  - exclusao sem dependencias remove a conta e registra auditoria `delete`;
  - UI em `/configuracoes` ganhou botoes de editar (form inline) e remover (com confirmacao) por conta cadastrada;
  - perfil `vendedor` é bloqueado nas duas operacoes via `assertPerfil`.
- Painel `/admin/saude` ganhou botao "Verificar agora" que dispara `verificarSaudeConectores` sob demanda (server action com `assertPerfil admin/gestor`), sem depender do agendamento do Inngest (que segue bloqueado por credenciais). Cobre a lacuna "execucao real de saude() dos providers conectados" no nivel de codigo; o resultado real do healthcheck ainda depende das credenciais/contas de cada provider.

## Verificacoes executadas

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run db:check`: aprovado.
- `npx vitest run --maxWorkers=1`: 21 arquivos e 123 testes aprovados.
- `npm run build`: aprovado com 38 rotas.
- `npx playwright test e2e/navegacao-responsiva.spec.ts --project=notebook-1024 -g "Configuracoes|Configurações"`: 1 teste aprovado.
- `npx playwright test e2e/navegacao-responsiva.spec.ts --project=notebook-1024 -g "Solicitacoes LGPD"`: 1 teste aprovado.
- `npx playwright test e2e/navegacao-responsiva.spec.ts`: 64 testes aprovados nos breakpoints 360, 768, 1024 e 1920.
- `npx playwright test e2e/navegacao-responsiva.spec.ts -g "Painel"`: 4 testes aprovados nos breakpoints 360, 768, 1024 e 1920 apos ampliacao do dashboard executivo.
- O teste responsivo foi ajustado para Next.js 16: `nextjs-portal` pode ser apenas o Dev Tools em dev; o teste continua bloqueando `[data-nextjs-dialog]`, que representa dialog de erro real.

## Lacunas locais restantes

1. Completar a homologacao LGPD:
   - aplicar migration `0014_lgpd_solicitacoes.sql` no banco Supabase conectado apos confirmacao especifica;
   - validar fluxo real de solicitacao/exportacao/anonimizacao com dados de staging;
   - exportacao assinada via Storage quando o bucket `documentos` estiver homologado.
2. Completar inbox por canal:
   - envio oficial por marketplace quando a politica permitir;
   - evidencias reais de mensagens recebidas por Mercado Livre, Shopee, TikTok Shop e Olist;
   - estados de entrega/falha por provider.
3. Completar validacao real de canais:
   - editar/remover `channel_account` com regra de impacto;
   - validacao assistida por canal quando as credenciais reais existirem;
   - execucao real de `saude()` dos providers conectados.
4. Completar documentos:
   - confirmar bucket privado `documentos`;
   - validar upload/download real com URL assinada;
   - adicionar templates por marca quando o cliente fornecer modelos.
5. Completar operacao:
   - executar Inngest real;
   - observar A18/A24/A20 em ambiente conectado;
   - registrar teste de restauracao de backup no RUNBOOK.
6. Refinar metricas comerciais quando o modelo evoluir:
   - vincular pedido a vendedor/responsavel quando o processo comercial exigir atribuicao direta;
   - medir North Star `% da receita influenciada pelo CRM` quando campanhas, reguas e follow-ups tiverem dados reais de origem.

## Bloqueios externos conhecidos

- Credenciais e contas reais dos marketplaces.
- Confirmacao especifica para aplicar migration 0014 no Supabase remoto conectado.
- Chaves Inngest de producao.
- Chave OpenAI para execucao real de A15/A16.
- Bucket/politicas de Storage em ambiente alvo.
- Homologacao real antes de liberar `EXTERNAL_SENDS_ENABLED=true`.

## Ciclo 2 (mesmo dia) — auditoria completa das Fases A/B/C e correcoes de codigo

Apos revisao ponto-a-ponto do codigo contra os DoDs (`fase-a-dod.json`, `fase-b-dod.json`,
`fase-c-dod.json`), a Fase A segue 100% fechada. Na Fase B e Fase C foram encontradas lacunas de
codigo reais escondidas atras do rotulo "pendente externo" nos DoDs — corrigidas neste ciclo:

- Item 3 (antigo) "editar/remover `channel_account`" — **confirmado ja resolvido** em ciclo anterior;
  removido da lista de lacunas.
- Webhook da Shopee (`src/app/api/webhooks/shopee/route.ts`) so processava atualizacao de pedido
  (`code === 3`); nao existia nenhum tratamento de mensagem/chat, ao contrario de Mercado Livre e
  TikTok Shop. Adicionado tratamento de `code === 3` (pedido, inalterado) e um novo caminho para
  mensagem de chat, chamando `receberMensagem` como os demais canais. O valor exato do `code` de
  chat da Shopee **precisa ser confirmado com logs reais de webhook na homologacao** (a Shopee nao
  publica uma tabela oficial estavel) — o codigo esta defensivo: qualquer `code` nao reconhecido
  continua sendo ignorado com 200, sem risco de processar dado incorreto.
- Aba "Perguntas" do Inbox (`inbox-perguntas.tsx`) era 100% front-end estatico (array vazio local,
  sem `actions.ts`, sem persistencia) enquanto a aba "Conversas" ao lado ja era real. Implementado
  `listarPerguntas`/`responderPergunta` em `inbox.service.ts` reaproveitando as tabelas
  `conversa`/`mensagem` (perguntas pre-venda de marketplace sao identificadas pela convencao de
  `externalId` no formato `<canal>-question:<itemId>`, ja usada pelo webhook do Mercado Livre). A
  resposta e registrada como resolucao interna/auditavel; o disparo real pela API oficial de cada
  marketplace segue como trabalho futuro (depende de homologacao de politica e escopo de escrita,
  nao apenas de credencial).
- `ai.service.ts` (orquestracao de chamadas OpenAI, corte suave de orcamento, aprovacao atomica de
  sugestao) nao tinha teste unitario direto, so cobertura indireta via E2E. Adicionado
  `src/test/domain/ai-service.test.ts` (10 testes, `db` e `emitirEvento` mockados) cobrindo: corte
  suave por orcamento, ausencia de `OPENAI_API_KEY`, reparo automatico de JSON invalido, falha apos
  a tentativa de reparo, trava atomica de aprovacao/rejeicao de sugestao (Invariante nº4) e
  agregacao de consumo/taxa de sucesso.
- `EmptyState` ganhou ilustracoes SVG customizadas (`illustrations.tsx`) para os tipos mais visiveis
  (`clients`, `conversation`/`inbox`, `reports`, `generic`) em vez de so icone Lucide em badge —
  atende ao item "ilustracoes" do portao de saida da Fase C. Os demais tipos continuam usando o
  icone em badge.
- Removido residuo de config: `src/config/dashboard.json` tinha campos `footer: "Dados simulados"`
  e arrays `items` com nomes ficticios em `recentClients`/`recentOrders` que nunca eram lidos pela
  pagina (o footer real e calculado dinamicamente a partir dos dados reais). Removidos para nao
  sugerir dado mockado onde hoje ja existe dado real.

### Novas lacunas locais identificadas (nao existiam antes deste ciclo de auditoria)

- Confirmar o `code` real de chat da Shopee com logs de webhook reais durante a homologacao da
  conta (hoje assumido `20` por analogia com integracoes de referencia, nao documentado oficialmente
  pela Shopee).
- Decidir e documentar se Olist (ERP sem chat nativo) deve alimentar o inbox unificado, para nao
  sugerir paridade total de inbox nos "4 canais fechados" onde ela nao se aplica.
- Implementar o disparo real de resposta de pergunta pela API oficial de cada marketplace quando a
  politica permitir (hoje a resposta fica registrada apenas internamente).

### Verificacoes executadas neste ciclo

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado com 39 rotas.
- `npx vitest run --maxWorkers=1`: 22 arquivos e 134 testes aprovados.
- Testes de integracao (`vitest.integration.config.ts`, banco Supabase conectado): 4 arquivos e 16
  testes aprovados, incluindo os novos `score-historico.integration.test.ts` e
  `inbox-perguntas.integration.test.ts`.
- Migration `0015_score_historico.sql` aplicada no banco Supabase conectado.
