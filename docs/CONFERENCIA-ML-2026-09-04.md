# Conferência de vendas WUWU em 04/09/2026

Esta conferência substitui as hipóteses anteriores de GMT-4 para vendas e de ausência de pedidos inferida somente por igualdade das contagens.

## Evidência

Relatórios oficiais de evolução de negócio de 28/08 a 04/09 e de 04/09, com corte informado às 19h35. O primeiro contém oito datas; o segundo contém vinte horas. São dados agregados, sem IDs individuais, com valores brutos arredondados em reais inteiros.

O agrupamento dos pedidos pela aprovação em Brasília, excluindo `cancel_detail.code=pack_splitted`, reproduz as contagens e os valores arredondados de cada linha. Hoje: 46 vendas, 51 unidades, R$ 1.750,60. Período completo: 577 vendas, 642 unidades, R$ 20.604,28. A soma das linhas diárias arredondadas é R$ 20.605; não alterar centavos para forçar igualdade visual.

## Implementação

- `dados_origem.aprovadoEmMs` preserva a primeira aprovação válida; `criado_em` permanece a criação.
- Consultas de Vendas e Faturamento usam aprovação para Mercado Livre e criação para outros canais.
- Registros técnicos `pack_splitted` são excluídos dessas consultas, mas continuam armazenados.
- Atalhos exclusivos de ML incluem N dias anteriores e hoje; datas personalizadas não são deslocadas.
- Enriquecimento de 4.244 pedidos existentes da WUWU com dados da API, sem alterar valor, status ou estoque.
- O script `verificar-resumo-relatorios.mts` chama o repositório real de Vendas e verifica bruto e contagens no corte do relatório.

## Limites de validação

O relatório de 30 dias não foi fornecido; seu atalho foi alinhado à convenção dos anteriores mais hoje, mas o total desse período ainda não está certificado. A regra de cancelamentos do painel permanece pendente: o print traz 21 e o Excel traz zero. O total bruto não deve ser confundido com faturamento após cancelamentos. Outros painéis analíticos e consultas diretas do provider precisam de conferência própria antes de afirmar equivalência completa.

Webhook e sincronização incremental já tinham alterações locais anteriores. Não houve publicação nem verificação da configuração do aplicativo ML nesta correção. Igualdade instantânea entre fotografias de horários diferentes não foi validada.
