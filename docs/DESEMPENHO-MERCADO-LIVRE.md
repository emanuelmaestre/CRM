# Resumo de desempenho em Vendas

Dentro de **Mercado Livre ao vivo → Ver desempenho e conferência**, os oito
indicadores usam as contas ativas das empresas selecionadas e o período da tela.
Busca e status da lista não restringem as métricas oficiais; a interface avisa isso.

## Fontes e limites

- Pedidos: `/orders/search`, com paginação completa, deduplicação por ID e
  janelas de até três dias. Não há leitura de endereço, envio ou comprador extra.
- Visitas: `/users/{seller_id}/items_visits`, abrangendo todos os anúncios da
  conta, inclusive os que não venderam. [Documentação oficial](https://developers.mercadolivre.com.br/recurso-visits).
- Na validação real de 30/08/2026, visitas rejeitaram timestamps ISO com HTTP 400.
  Datas `YYYY-MM-DD` foram aceitas e a resposta delimitou dias em UTC−4.
  O código valida as datas retornadas; outro calendário torna visitas/conversão
  indisponíveis, em vez de misturar períodos silenciosamente.
- Os oito indicadores usam dias UTC−4: de 01h a 00h59 do dia seguinte em Brasília.
  A conferência de faturamento existente continua em UTC−3. A consulta de pedidos
  cobre a união dos intervalos, mas cada resumo filtra sua própria fronteira.
- Os dados são reconstruídos de APIs públicas. Não há acesso ao cálculo interno
  do painel de Métricas; não se promete igualdade exata com esse painel.

## Cálculos publicados

| Card | Regra |
| --- | --- |
| Vendas brutas | Soma de `total_amount` de todos os pedidos criados no recorte, incluindo cancelados, devolvidos e não pagos; não é valor recebido. |
| Unidades vendidas | Soma de `order_items.quantity` dos mesmos pedidos. Quantidade ausente invalida este campo. |
| Preço médio por unidade | Vendas brutas / unidades. |
| Visitas | `total_visits` de todas as contas selecionadas. |
| Quantidade de vendas | IDs distintos de pedidos; diferentes orders do mesmo pack contam separadamente. |
| Conversão | Quantidade de vendas / visitas × 100. |
| Preço médio por venda | Vendas brutas / quantidade de vendas. |
| Quantidade de vendas canceladas | Pedidos criados no recorte com status atual `cancelled`; não inclui devoluções ou status `invalid`. |

As bases são somadas entre empresas antes de calcular médias e conversão.
Valores monetários são somados em centavos. Denominador zero não gera média/taxa
artificial. Zero real é exibido como zero; informação ausente fica indisponível.

## Comparação e atualização

A comparação usa o período imediatamente anterior de igual número de dias.
Visitas não aceitam corte por hora, por isso períodos atuais em andamento são
sinalizados como parciais, comparados com dias completos anteriores.
Variações usam `(atual − anterior) / anterior × 100`, exceto conversão, em pontos
percentuais. Base anterior zero não produz crescimento infinito.

O Mercado Livre atualiza a cada minuto com a página visível, sem sobreposição
de consultas. Uma resposta antiga não sobrescreve uma nova seleção. Visitas
dependem da atualização do próprio canal. Falha de visitas preserva as métricas
de pedidos, mas impede conversão; falha de uma conta impede total parcial; falha
histórica não apaga o período atual. A diferença API/CRM continua visível.

A continuação da Shopee mantém o mesmo cartão de conferência, com leitura de
pedidos/financeiro e atualização a cada cinco minutos. A origem retornou HTTP 502
para as duas lojas na validação de 30/08/2026; essa indisponibilidade é mostrada,
sem substituir o valor oficial pelo valor local.
