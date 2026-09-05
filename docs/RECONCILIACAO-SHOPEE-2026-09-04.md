# Reconciliação Shopee — 04/09/2026

Escopo autorizado: Shopee Armarinhos Lima e WUWU. Sem alteração em Mercado Livre. Janelas por criação, em Brasília: Hoje 04/09; 7 dias 29/08–04/09; 30 dias 06/08–04/09. Comparação com pedidos e financeiro das APIs oficiais via integração do CRM, não com relatório do Seller Center. Os rótulos de período do Seller Center não foram validados nesta execução.

Prévia às 20:46:39: Armarinhos Lima sem pedidos ausentes ou diferenças de valor/status; faturamento e bruto iguais à API: Hoje R$0,00 (0), 7 dias R$653,34 (6), 30 dias R$997,75 (9). Nenhum cancelamento na janela.

O script scripts/reconciliar-shopee.mts roda sem escrever pedidos por padrão. --apply usa ingerirPedido em modo histórico, sem efeitos operacionais de estoque/mensagens. Cancelados/devolvidos sem evidência financeira detalhada são separados para auditoria, nunca classificados como pagos apenas porque possuem total.

## Aplicação e resultado

Corte final: 04/09/2026 20:48:54 Brasília. Reprocessados 380 pedidos (9 Armarinhos, 371 WUWU), sem falhas da ingestão. Seis cancelados WUWU sem evidência conclusiva foram preservados sem alteração (R$336,70): 26081024H188DG, 2608100V8XFXFP, 260809UG7BU0E3, 2609044RF7P25K, 2609044QP5N1KY, 260828G7TX6W9K.

O provider Shopee agora solicita e preserva pay_time (prova positiva válida) e cancel_reason. A recuperação inclui cancelados com prova de pagamento e exclui financeiramente casos explicitamente Unpaid Order, sem apagar prova histórica anterior. Ausência de pay_time, isoladamente, não foi classificada como falta de pagamento nesta reconciliação.

WUWU: prévia 377 pedidos API, nenhum ausente ou valor individual diferente, oito status diferentes. Após ingestão, restaram três registros devolvidos bloqueados pela regra terminal do CRM, mas COMPLETED na API: 2608125CVPVBK4/R$31,90, 2608112PK0RXKV/R$69,90 e 2608112N4RMMGK/R$69,90. O script corrigir-status-confirmado-shopee.mts confirmou novamente os três pela API, verificou pagamento e versão, atualizou somente seus status no escopo Shopee/WUWU e gravou antes/depois em audit_log na mesma transação. Sem eventos operacionais. A regra compartilhada de transição não foi alterada; a prevenção desse caso recorrente permanece pendente de modelagem do ciclo de devoluções Shopee.

| Marca/período | Faturamento API | Faturamento CRM | Pedidos faturáveis | Bruto CRM |
|---|---:|---:|---:|---:|
| Armarinhos Hoje | 0,00 | 0,00 | 0 | 0,00 |
| Armarinhos 7 dias | 653,34 | 653,34 | 6 | 653,34 |
| Armarinhos 30 dias | 997,75 | 997,75 | 9 | 997,75 |
| WUWU Hoje | 853,99 | 853,99 | 18 | 853,99 |
| WUWU 7 dias | 4.803,15 | 4.803,15 | 103 | 5.458,85 |
| WUWU 30 dias | 14.362,91 | 14.362,91 | 331 | 15.708,24 |

Diferença de faturamento: zero nos seis recortes. Bruto CRM não é declarado equivalente ao GMV do Seller Center: seis cancelados continuam ambíguos, e não foi fornecido relatório oficial do painel Shopee. Contagem e valor dos pedidos faturáveis coincidem com a fotografia da API usada na reconciliação.

Validação: TypeScript e ESLint passaram; 683 testes de domínio passaram em 90 arquivos. Sem deploy. As credenciais foram configuradas apenas no ambiente local na etapa anterior.

## Prevenção do bloqueio — atualização posterior

A ingestão agora possui uma exceção restrita a Shopee/devolvido → COMPLETED. Exige evidência de pagamento e versão de origem válida e não anterior à armazenada. A regra geral de progressão permanece intacta para Mercado Livre, TikTok, cancelados e outros destinos.

A correção de status e o audit_log são gravados na mesma transação, sob bloqueio do pedido. Não gera eventos de pagamento/entrega nem recuperação do outbox nessa correção, evitando repetir efeitos operacionais. Payload antigo é recusado antes da correção. Uma repetição da conclusão não cria outra auditoria de transição.

Testes adicionados: regra de canal, versão antiga/ausente/inválida, pagamento, cancelados e repetição; teste do serviço de ingestão com banco simulado verifica gravação, auditoria e ausência de eventos. Sem nova alteração dos pedidos reais nesta etapa e sem deploy.
