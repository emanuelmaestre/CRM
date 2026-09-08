# Composição dos cards de pedidos

O resumo de Vendas distingue pedidos recebidos de receita confirmada. Shopee e TikTok Shop usam a criação do pedido, com os limites do período convertidos de Brasília. Mercado Livre mantém a aprovação do pagamento e a exclusão de divisões técnicas de pacote.

Para Shopee e TikTok:

- Total bruto conta cada pedido uma vez, inclusive não pagos e cancelados.
- Confirmado e Pedidos continuam usando a lista positiva de status faturáveis.
- Quando há status da Shopee/TikTok preservado no payload, os cards usam seu mapeamento, em vez da etapa operacional local. Sem status externo, usam o estado local legado; status externo desconhecido fica pendente. O mapeamento é compartilhado com a ingestão.
- Cancelamentos/devoluções contam também cancelamentos sem pagamento; o valor não significa necessariamente dinheiro devolvido ao comprador.
- Pendentes entram no bruto, com quantidade, valor e consulta própria, mas não entram em Confirmado.
- Reembolsos parciais dependem de valores explicitamente informados; ausência do campo não comprova inexistência de reembolsos no canal.
- TikTok: o pós-venda é consultado separadamente em `Search Returns`. Casos `RETURN_OR_REFUND_REQUEST_COMPLETE` são somados pelo `refund_total`, incluindo frete devolvido. Casos pendentes, rejeitados ou cancelados não reduzem receita. O identificador e a versão de cada caso impedem duplicação e regressão; casos antigos fora da janela permanecem preservados.
- Reembolso integral de um pedido faturável Shopee/TikTok o classifica como devolvido no resumo financeiro, sem mudar sua etapa operacional. Reembolso parcial reduz Confirmado e aparece no indicador próprio. O bruto original permanece intacto.
- No TikTok, o valor é `total_amount`, incluindo `handling_fee`, como a coluna `Order Amount` dos relatórios oficiais recebidos. A Olist pode excluir acréscimos; essa diferença não autoriza retirar valores para fazer o CRM coincidir com ela. Frete e descontos já integram o total e não são deduzidos novamente. A mesma base é usada por bruto, confirmado, cancelados, devolvidos e pendentes. O líquido informado pelo canal tem prioridade sobre a estimativa.

A soma explicativa é: bruto = confirmado + cancelados/devolvidos + reembolsos parciais + pendentes. Quantidades contam cabeçalhos de pedidos, não linhas de SKU ou unidades. A consulta de cada indicador usa os mesmos filtros e predicados do resumo. As regras de pagamento, data e valores do Mercado Livre foram preservadas.

## Auditoria reproduzível

```powershell
node --import tsx scripts/auditar-cards-marketplaces.mts --inicio=2026-08-07T00:00:00-03:00 --fim=2026-09-07T00:00:00-03:00 --captura=2026-09-06T22:29:00-03:00 --api
```

O início é inclusivo e o fim é exclusivo. O script consulta empresas ativas e contas não encerradas de Shopee/TikTok. Não ingere, reconcilia nem atualiza pedidos. Sem `--api`, audita somente o banco e sinaliza que o canal não foi consultado. Falhas de API são registradas, nunca convertidas em uma lista vazia bem-sucedida.

Os arquivos privados vão para `outputs/auditoria-cards-<timestamp>/`, fora do Git. Há comparação por ID, status, valores pagos e comparáveis, componentes financeiros, unidades, entrada em cada card e motivo de divergência. `totalApi` e `totalComparavelApi` preservam o total original da API, inclusive acréscimos do comprador no TikTok. Com `--api`, o script também confere o pós-venda TikTok até o momento da consulta, pois um pedido criado no período pode ter sido reembolsado depois. `posVendaConsultado` e `erroPosVenda` distinguem falta de consulta de zero reembolsos.

## Atualização do pós-venda

A A24 concilia pós-venda TikTok por data de atualização, com cursor próprio e sobreposição. Só avança a cobertura depois de persistir todos os casos; falha de API não vira zero. A leitura completa antecede as gravações, que são restritas a organização, conta, canal e pedido. O serviço preserva total, estoque e estágio operacional. O backfill inicial de dados anteriores à janela automática precisa ser executado por `conciliarReembolsosTikTok` com intervalo explícito; o código não inventa um histórico anterior ao primeiro acesso.

A auditoria de 08/09/2026 conferiu 265 combinações de conta/período, 1.484 pedidos e oito planilhas. Os arquivos privados estão em `outputs/auditoria-shopee-tiktok/`, incluindo `RELATORIO-AUDITORIA.md`. A consulta Shopee de devoluções retornou `error_api_permission`; o pós-venda desse canal não foi certificado. A continuação conferiu 953 valores líquidos oficiais, atualizou 54 registros financeiros e validou mais 265 composições de líquido; os 531 pedidos restantes não tinham repasse na consulta. As capturas escuras são da Olist, não dos marketplaces.

O resumo informa `liquidoEstimadosQtd` para pedidos faturáveis Shopee/TikTok sem `valor_liquido`; a interface identifica quando o líquido inclui estimativas. A conciliação de repasses TikTok aceita `orderIds` opcional para uma atualização dirigida, preservando o comportamento periódico quando o filtro não é informado.

`--captura` sinaliza recebimentos e atualizações posteriores ao instante informado. Ele **não reconstrói** preços ou estados históricos ausentes. Comparações com imagens antigas exigem o período exato e os relatórios de pedidos correspondentes; catálogos de produtos não os substituem. Mesmo igualdade do bruto não valida sozinha os seis cards, a definição de cada relatório ou todos os reembolsos.

## Verificação

```powershell
npx vitest run src/test/domain/regras-resumo-vendas.test.ts src/test/domain/pedidos-indicador-dialog.test.tsx src/test/domain/vendas-cards-resumo.test.tsx
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts src/test/integration/resumo-marketplaces.integration.test.ts
npm run typecheck
npm run build
```

Os testes SQL usam CTEs com dados sintéticos, sem gravar tabelas. Cobrem checkouts não pagos, cancelamentos, reembolsos parciais, juros, início/fim do dia em Brasília e a preservação do Mercado Livre num resumo com vários canais.
