# Publicação isolada — 04/09/2026

Autorização: publicar somente Shopee/TikTok, preservando mudanças locais de outros módulos e Mercado Livre.

## Publicado

- Site: https://elisa-lima.vercel.app
- Deployment: dpl_7KG1mDiBxz3gRJptHULhXAZaKJ2A
- Fonte: 122671d6a72c12eb5435f7c0932437786f65add5, branch local codex/shopee-tiktok-sync-isolado.
- Worktree: .codex-runtime/release-shopee-tiktok.
- Base anterior: b0f1a4e288388429e686b0e059f82c6fc1d4e8fa; deployment anterior dpl_XbJhnc7o5NYwdDoFfE73tPdXBmYZ.
- Compilação remota e promoção concluídas. Domínio consultado pela API aponta para o novo deployment READY.
- 723 testes / 94 arquivos aprovados, typecheck e lint dos módulos alterados aprovados.
- Consulta somente leitura no PostgreSQL: 96 combinações de canal/status/evidência aprovadas, incluindo preservação do Mercado Livre.
- Login HTTP 200. GET autenticado /api/inngest HTTP 200, cloud, crm-leo, 29 funções. GET sem assinatura retorna 401 conforme o SDK; não é evidência de indisponibilidade.

## Isolamento

Não publicado: alterações locais de estoque, clientes, interface, datas financeiras do Mercado Livre. Arquivos compartilhados usam condições explícitas de canal. A base publicada não é a árvore principal local; não publicar a árvore principal por cima sem integrar/revisar esta branch, pois ela contém trabalho de outras etapas.

Foi preservada a distinção entre pagamento desconhecido e negativa explícita. Uma evidência ausente não gera pagamentoAprovado=false. Timeout TikTok explicitamente observado em português/espanhol gera negativa, salvo prova positiva atual/anterior.

## Validação operacional ainda pendente

Em 04/09 às 21:43 Brasília, a API do Inngest mostrou oito execuções A31 em QUEUED desde 21:06, todas anteriores à publicação. Cinco correspondem a Shopee/TikTok (duas Shopee, três TikTok). A listagem de execuções RUNNING não retornou registros no recorte de 24h; a consulta de jobs de uma execução enfileirada retornou lista vazia. A configuração A31 tem concorrência 1. Esses fatos NÃO provam a causa do bloqueio.

O script de validação encontrou execuções abertas e não disparou duplicatas; nenhuma execução foi cancelada, reiniciada ou encerrada artificialmente. O teste ponta a ponta após publicação ainda não concluiu. Necessário inspecionar o painel operacional do Inngest antes de qualquer alteração na fila compartilhada.

Também permanecem pendentes os cancelamentos sem prova financeira e a comparação com relatórios oficiais Seller Center Shopee/TikTok. Não afirmar equivalência ao painel oficial apenas porque a API bateu.

## Continuação: evidência externa

O painel Inngest tornou-se acessível na continuação. A31 aparece na lista de funções ativas. A API ainda mostrou as oito execuções QUEUED; o trace da WUWU TikTok mostrou apenas o nó Run em WAITING, sem início de steps.

O fornecedor publicou o incidente "Degraded Function Execution", componente Function execution, em 04/09/2026: https://status.inngest.com/incidents/01M1PTRY874WYVE4FN0TT4NBRD . Na consulta, o incidente estava em Monitoring/Partial outage, com causa identificada pelo fornecedor e recuperação em acompanhamento. É compatível com a espera observada, mas não prova retrospectivamente a causa de todos os atrasos do CRM. Nenhuma execução foi cancelada ou duplicada nesta continuação.

## Recuperação concluída em 04/09 às 22:14 Brasília

Após nova autorização para recuperar pendências, o fornecedor informou operação normal. Foi cancelada somente a tentativa ainda QUEUED da Shopee Armarinhos Lima (01M1QE6CRGVDH5JGRPF2XKBQSY), com confirmação CANCELLED antes do rerun oficial (01M1QJ02J2P2CD5Q3RFM17FXHC). O rerun reutilizou o evento original, restrito ao módulo pedidos. As outras execuções retomaram sem intervenção. Não atribuir a recuperação geral ao rerun: coincidiu com a recuperação do fornecedor.

As cinco contas alvo concluíram sem erro no banco: TikTok Armarinhos 22:12:59; TikTok Karzi 22:13:19; Shopee WUWU 22:13:38 (27 encontrados, 2 novos); TikTok WUWU 22:14:11 (144 encontrados, 5 novos); Shopee Armarinhos 22:14:18. Nenhuma execução ML foi cancelada, reexecutada ou disparada por esta recuperação.

### Conferência somente leitura, fonte API

Períodos explícitos: hoje 04/09; 7 dias 29/08–04/09; 30 dias 06/08–04/09, Brasília. Corte TikTok 22:13:55 e Shopee 22:14:39. Valores abaixo são faturamento confirmado, não total bruto incluindo cancelamentos.

| Canal / marca | Hoje CRM = API | 7 dias CRM = API | 30 dias CRM = API |
| --- | ---: | ---: | ---: |
| Shopee Armarinhos Lima | 0,00 | 653,34 | 997,75 |
| Shopee WUWU | 1.000,91 | 4.950,07 | 14.509,83 |
| TikTok Armarinhos Lima | 0,00 | 45,26 | 162,77 |
| TikTok Karzi | 0,00 | 268,70 | 285,20 |
| TikTok WUWU | 1.216,23 | 7.745,45 | 16.734,94 |

Diferença de faturamento confirmado: zero em 15/15 recortes. Quantidade faturável também igual. Nenhum pedido retornado pela API ausente no CRM; nenhuma diferença de status ou total por pedido retornado. Isso não comprova igualdade ao Seller Center nem resolve cancelamentos sem evidência financeira.

A primeira tentativa do script local deixou de carregar .env e não encontrou o par Shopee catálogo; corrigido o comando para carregar .env e .env.local, ambas contas foram conferidas. Não era falta de credencial em produção e nenhuma credencial foi alterada.

### Aviso de atualidade

Consulta somente leitura do estado de Vendas retornou pronto/100, sem falhas, após confirmar os horários reais de conclusão. Executados 14 testes existentes de UI e cobertura, todos aprovados: falha revela conteúdo com carimbo/aviso, não apaga a tela; recusas Shopee/TikTok não avançam cobertura. Não foi necessário criar outro sistema nem alterar código para esta recuperação. Os testes de UI emitiram avisos não fatais de act já existentes.
