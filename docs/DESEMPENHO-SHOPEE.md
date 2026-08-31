# Resumo de desempenho da Shopee

Em **Vendas → Shopee ao vivo → Ver desempenho e conferência**, os oito cards
usam o período e as empresas selecionadas. Busca e status da lista não se aplicam
aos indicadores oficiais. A conferência financeira existente continua abaixo.

## Fontes e fórmulas

| Card | Fonte e regra |
| --- | --- |
| Vendas brutas | Soma de `buyer_total_amount` do financeiro quando disponível, com `total_amount` do pedido como alternativa. É a mesma base do total bruto da conferência, incluindo cancelados, devolvidos e não pagos. Pode incluir frete e ajustes do comprador; não é GMV de produtos nem repasse líquido. |
| Unidades vendidas | Soma de `item_list[].model_quantity_purchased` dos mesmos pedidos. Quantidades ausentes ou inválidas deixam o indicador indisponível. |
| Preço médio por unidade | Valor bruto dos pedidos dividido pelas unidades. Pode incluir frete e ajustes; não representa preço de catálogo. |
| Visitas | Indisponível: a integração atual não fornece visitas da loja por período. Não substituímos por cliques de Ads ou visualizações acumuladas dos produtos. |
| Quantidade de vendas | Contagem de `order_sn` distintos. Um pedido com vários produtos conta uma vez. |
| Conversão | Indisponível porque depende de visitas no mesmo período. Nenhuma taxa é estimada. |
| Preço médio por venda | Valor bruto dos pedidos dividido pela quantidade de pedidos. |
| Quantidade de vendas canceladas | Pedidos criados no período com status atual `CANCELLED`. Não inclui `IN_CANCEL` ou `TO_RETURN`. A conferência pode excluir esses outros estados pela regra financeira do CRM. |

Os pedidos são listados pela data de criação, no horário de Brasília (UTC−3).
Os detalhes são consultados em lotes de até 50, solicitando apenas
`total_amount,item_list`. Não há leitura adicional de endereços ou compradores.
O financeiro mantém as fontes, credenciais e alternativas já usadas pela conferência.
Não se promete equivalência com as fórmulas internas da Central do Vendedor.

## Comparação, atualização e falhas

A comparação usa o intervalo completo imediatamente anterior, de mesma duração.
Quando o período atual ainda está em andamento, um aviso identifica a comparação
parcial com os dias completos anteriores. A atualização automática continua a
cada cinco minutos com a página visível.

As bases das empresas são somadas antes das médias. Valores monetários são
somados em centavos. Denominador zero não produz média artificial; valor ausente
não vira zero. Sem histórico completo de todas as contas, a comparação fica
indisponível e o período atual continua visível. Falha na consulta atual de uma
conta impede a apresentação de um total parcial como se fosse completo.

## Validação

Os testes exercitam múltiplos itens, pedidos duplicados, cancelamentos confirmados,
cancelamentos em andamento, devoluções, quantidades ausentes ou inválidas, período
vazio, detalhes incompletos e a apresentação dos oito cards, inclusive explicações
e estado de carregamento. As respostas desses testes são simuladas; não são dados
de produção.

Na validação local de 31/08/2026, a exportação de variáveis da Vercel trouxe valores
mascarados, inutilizáveis para autenticar as APIs. Isso não comprova indisponibilidade
da Shopee em produção. Nenhuma configuração ou credencial de produção foi alterada.
