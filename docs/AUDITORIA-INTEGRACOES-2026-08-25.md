# Auditoria de integrações — 25/08/2026

## Escopo e método

Auditoria do código, banco, migrações, jobs, webhooks e telas relacionados a Mercado Livre, Shopee, TikTok Shop, importação por arquivo e módulos de estoque, vendas, clientes, avaliações, publicidade e métricas.

Nenhuma chamada foi feita às APIs da Shopee ou do Mercado Livre durante a auditoria. Em particular, não foi consumido tráfego do proxy Webshare. As verificações usaram o código e consultas diretas de leitura ao banco. A única alteração direta no banco foi a migração segura do índice de SKU descrita abaixo.

## Retrato dos dados

- 3 empresas ativas: Armarinhos Lima, Karzi e Wuwu.
- Mercado Livre conectado nas 3 empresas; Shopee conectada em Armarinhos Lima e Wuwu.
- TikTok Shop aparece degradado/sem credenciais operacionais.
- 706 produtos, 739 vínculos com anúncios e 738 saldos vinculados.
- 4.324 pedidos: 4.120 do Mercado Livre e 204 da Shopee.
- 3.718 clientes.
- Avaliações: 620 anúncios do Mercado Livre e 145 anúncios da Shopee acompanhados.
- Publicidade: 1.400 snapshots de campanhas e 8.055 snapshots de anúncios, com histórico diário de 18/05 a 25/08.
- Importação histórica: 4.183 itens processados, sendo 3.082 importados, 528 duplicados e 573 em quarentena.

## O que está consistente

- Todos os pedidos têm conta, empresa, itens, frete, descontos e acréscimos associados.
- Nenhum produto ativo está sem SKU, nome, preço ou vínculo com canal.
- Não foram encontrados pedidos, produtos ou vínculos duplicados nas restrições atuais.
- Os 706 produtos estão distribuídos entre Armarinhos Lima (511), Karzi (14) e Wuwu (181).
- O histórico de publicidade está completo para as três empresas no período armazenado.

## Lacunas esperadas das plataformas

- A Shopee não fornece a taxa de marketplace no contrato atualmente consumido; por isso essa taxa está vazia nos 204 pedidos Shopee, sem indicar falha de importação.
- E-mail e documento dos compradores não são fornecidos na maioria dos pedidos por restrições de privacidade. Endereço também não existe em parte do histórico.
- Produtos sem nota em avaliações podem ainda não ter recebido avaliação. Isso não significa necessariamente falha.
- Publicidade atualmente tem fonte operacional do Mercado Livre; não existe ingestão equivalente de anúncios para Shopee/TikTok no projeto.
- A importação Excel é upload de CSV/XLSX/JSON para clientes, não uma conexão contínua com o aplicativo Excel. Não há lotes de clientes importados registrados no banco.

## Falhas e riscos encontrados

1. O SKU era único por organização, embora o produto pertença a uma empresa. Um mesmo SKU usado em empresas diferentes colidia e pedidos podiam ser classificados silenciosamente como ignorados. O índice foi corrigido para organização + empresa + SKU e a migração 0049 já foi aplicada.
2. Sincronizações recentes da Shopee registraram pedidos ignorados por SKU ausente ou não mapeado. A correção do índice elimina as colisões entre empresas, mas os SKUs realmente ausentes ainda precisam de uma sincronização controlada de catálogo e pedidos.
3. Existe um único vínculo de anúncio do Mercado Livre sem saldo correspondente. A próxima reconciliação de estoque deve recompô-lo.
4. O job de avaliações executava um lote grande, podia atingir timeout e reiniciar do começo. Isso explica a sensação de módulo incompleto, principalmente em Armarinhos Lima.
5. Avaliações da Shopee estavam armazenadas e apareciam na tela, mas não entravam no cálculo de saúde da loja.
6. O snapshot agregado de métricas tem somente três dias de histórico; comparações históricas ainda são naturalmente limitadas.
7. Havia execuções antigas abandonadas e registros de um cron anterior muito frequente. O código atual foi repartido em etapas duráveis e teve frequências reduzidas.

## Correções realizadas

- Removidos mensagens e reclamações da sincronização manual, dos indicadores de progresso e das chamadas externas de métricas.
- Webhooks de mensagens/perguntas agora são reconhecidos e ignorados antes de consultar token ou API externa. Pedidos continuam sendo processados normalmente.
- Dados históricos de mensagens/reclamações foram preservados para evitar quebra de integridade ou perda irreversível.
- Avaliações Shopee e Mercado Livre agora são combinadas no indicador de saúde, ponderadas pela quantidade de avaliações.
- Job de avaliações dividido por conta/página e ampliado para validar os dois canais. Frequência reduzida de 24 para 4 execuções por dia.
- Monitor de saúde dos conectores reduzido de quatro vezes por hora para uma vez por hora; a renovação de token continua separada.
- Consulta de variações Shopee (`get_model_list`) passou a reutilizar resultados no mesmo lote, eliminando chamadas duplicadas por variação.
- Reconciliação de estoque reutiliza uma única instância do provedor por conta dentro do lote.
- Tela de publicidade recebe o período inicial já processado pelo servidor, evitando uma segunda viagem após a página aparecer.
- Controles de período e filtros críticos deixaram de depender de carregamento dinâmico tardio.
- Filtros de empresa/canal em avaliações já nascem com as contagens recebidas do servidor, sem o intervalo em que apareciam desabilitados.
- Consulta não utilizada de contas foi removida da página de publicidade.

## Tráfego e qualidade

O maior volume Shopee observado vinha de consulta repetida de variações, listagem/detalhe de pedidos e checagens de saúde. As mudanças reduzem chamadas duplicadas, diminuem avaliações repetitivas em aproximadamente 75% e reduzem checagens de saúde em 75%, mantendo webhooks de pedidos, renovação de tokens e reconciliação periódica.

Mensagens e reclamações deixam de gerar tráfego ativo. A reputação do Mercado Livre continua disponível porque faz parte da saúde da conta; ela não usa o endpoint separado de reclamações.

## Pendências operacionais

Após publicar o código, executar uma única sincronização controlada, fora do horário de pico, nesta ordem:

1. catálogo Shopee das duas contas;
2. pedidos Shopee;
3. avaliações Mercado Livre e Shopee;
4. reconciliação de estoque.

Essa execução consumirá algum tráfego Webshare, mas é necessária uma única vez para recuperar itens que já haviam sido ignorados. Ela não foi disparada durante a auditoria para preservar a franquia. Depois, conferir a quarentena e mapear manualmente apenas os SKUs que continuarem sem correspondência.

## Validação técnica

- Verificação das migrações: aprovada.
- Lint: aprovado.
- Testes: 50 arquivos e 353 testes aprovados.
- Build de produção do Next.js: aprovado.

## Complemento — remoção de publicação externa

Após a auditoria, foi decidido que o CRM será usado para consulta e controle de
estoque, sem publicar alterações de título ou preço nos marketplaces. O job A27,
seu evento de disparo e o método de escrita de anúncio do Mercado Livre foram
removidos. Shopee e TikTok Shop já não implementavam esse tipo de publicação.

Foram preservados intencionalmente:

- leitura de catálogo e anúncios;
- métricas de publicações e publicidade;
- pedidos, avaliações e saúde dos canais;
- consulta e atualização de saldo de estoque.

A atualização de estoque não é publicação de conteúdo: ela continua ativa para
manter o saldo operacional dos anúncios consistente com o CRM.

Validação do complemento: typecheck, lint, 50 arquivos/349 testes, build de
produção e verificação do esquema do banco aprovados.

## Complemento — desempenho dos filtros de Avaliações

A tela carregava 765 anúncios (620 Mercado Livre e 145 Shopee) e tentava montar
e animar todos os resultados correspondentes a cada toque. Os filtros também
existiam duas vezes no DOM, em versões separadas para mobile e desktop. Isso
causava trabalho duplicado na hidratação, nomes acessíveis repetidos e atraso na
troca entre canal e empresa.

Correções aplicadas:

- consultas aos caches de Mercado Livre e Shopee executadas em paralelo;
- uma única árvore responsiva de botões para canal e empresa;
- resultados montados em lotes de 30, com carregamento progressivo;
- retirada da animação escalonada de centenas de anúncios;
- busca textual adiada para não bloquear a digitação;
- cruzamento opcional de compradores restrito a anúncios com comentários;
- dados novos entregues pelo servidor passam a prevalecer sobre o cache antigo
  do navegador;
- removido do cliente o código morto de consulta direta ao marketplace.

Na primeira rodada da medição local, a leitura sequencial das duas tabelas levou
323 ms; em paralelo, 140 ms. A validação passou com 51 arquivos/351 testes,
typecheck, lint, build de produção e verificação do esquema do banco.
