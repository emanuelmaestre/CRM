# Sincronização Shopee/TikTok — correções locais

Escopo: Shopee e TikTok. Não foram executados jobs em produção nem modificados pedidos ou credenciais nesta etapa. Mercado Livre mantém sua política anterior nos jobs compartilhados.

## Falhas identificadas no código

1. A31 manual sem início explícito escolhia criação. Para Shopee/TikTok agora escolhe atualização, inclusive quando o pedido foi criado antes da janela. Backfill/reconciliação explícita continua por criação.
2. A31 filtrava candidatos com status já conhecido e líquido disponível. Isso podia perder alteração financeira mantendo o mesmo status. Shopee/TikTok agora leem todos os candidatos da janela, sem esse filtro. Mercado Livre preserva o filtro anterior.
3. A31 podia marcar módulo concluído com recusas parciais. Shopee/TikTok agora registram erro de atualização parcial se houver qualquer pedido recusado.
4. A24 já buscava por atualização e verificava a persistência das falhas, mas podia marcar verificação completa com recusas. Nos dois canais agora não avança cobertura nem registra verificação completa enquanto houver recusas. A fila durável continua disponível e a próxima coleta retoma com sobreposição. É uma escolha conservadora: pendência prolongada pode aumentar o custo de releitura até sua resolução.
5. A24 selecionava apenas contas conectadas, excluindo as degradadas que precisavam recuperar. Agora inclui contas Shopee/TikTok degradadas não encerradas, mantendo desconectadas fora e a seleção ML anterior.
6. Shopee podia aceitar resposta sem lista ou indicador de continuidade como lista vazia. Agora rejeita resposta incompleta. Cursores repetidos/ausentes com continuação já eram validados; TikTok também já verificava paginação incompleta.

Manual incremental Shopee/TikTok revisita uma hora antes do início solicitado. A24 conserva o cursor persistido e a sobreposição existentes. Retentativas usam a ingestão idempotente; nenhum cron novo foi criado nem frequência alterada.

## Verificação

Testes de política por canal; serviço A24 simulado com falha de paginação, falha de ingestão persistida, avanço após gravação e preservação da política ML; testes de resposta Shopee incompleta. TypeScript e ESLint dos arquivos de produção passaram.

Rodada final: 705 testes passaram em 93 arquivos de domínio. Consulta real de leitura da Shopee após a validação estrita: Armarinhos 0 pedidos hoje e WUWU 19, ambas sem erro. Nenhuma reconciliação de escrita foi disparada nesta etapa.

## Limites

São correções no projeto local, sem deploy. Para atuarem no servidor, é necessário publicar e verificar a execução real dos jobs/webhooks. Credenciais configuradas apenas localmente não são transferidas ao servidor por estas mudanças. Não foi comprovada a disponibilidade do agendador em produção nesta etapa. Não garante igualdade instantânea ao Seller Center nem elimina atrasos da própria API; monitorar execuções reais após publicação é uma validação ainda necessária.
