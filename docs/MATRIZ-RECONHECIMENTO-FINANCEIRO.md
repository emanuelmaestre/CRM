# Matriz de Reconhecimento Financeiro de Pedidos

> Atualização de 04/09/2026: a [conferência com os relatórios oficiais](CONFERENCIA-ML-2026-09-04.md)
> prevalece sobre hipóteses anteriores de calendário. Vendas do Mercado Livre
> usam a aprovação em Brasília. Cancelamentos técnicos `pack_splitted` não
> compõem vendas comerciais, mesmo com pagamento anterior. Os atalhos exclusivos
> do canal incluem os dias anteriores e hoje. A classificação de cancelamentos
> do painel e o total de 30 dias ainda não foram certificados pelos arquivos.

## 1. Finalidade

Este documento estabelece a regra financeira comum do CRM para pedidos do
Mercado Livre, Shopee e TikTok Shop.

Seu objetivo é impedir que intenção de compra, checkout abandonado, pedido sem
pagamento ou dado incompleto seja tratado como venda. A mesma regra deve orientar
integrações, banco de dados, serviços, indicadores, relatórios, auditorias e a
interface do módulo Vendas.

> **Regra principal:** o pagamento aprovado é o fato gerador da venda. Antes
> dele existe uma tentativa de compra. Depois dele, cancelamentos, devoluções e
> reembolsos são ajustes pós-venda.

## 2. Escopo

Esta matriz cobre:

- carrinho e checkout;
- criação e atualização de pedidos;
- aprovação, recusa e expiração de pagamentos;
- preparação, envio, entrega e conclusão;
- cancelamento, devolução e reembolso;
- cálculo dos seis cards do módulo Vendas;
- normalização de status entre canais;
- tratamento de dados ausentes, nulos ou desconhecidos;
- diferença de datas e fuso horário;
- rastreabilidade e critérios de aceite.

Não fazem parte do reconhecimento bruto da venda:

- tarifas do marketplace;
- comissões;
- custos ou subsídios de frete;
- impostos;
- antecipações;
- outros descontos ou acréscimos do repasse.

Esses componentes pertencem ao cálculo de repasse líquido.

## 3. Conceitos oficiais

### 3.1 Intenção de compra

O cliente colocou um produto no carrinho, mas o canal ainda não gerou um pedido
visível para o vendedor ou para a API.

**Efeito financeiro:** nenhum.

### 3.2 Tentativa de compra

O checkout foi iniciado ou o canal gerou um pedido, mas ainda não existe
pagamento aprovado.

**Efeito financeiro:** nenhum.

### 3.3 Venda reconhecida

Existe evidência confiável de pagamento aprovado pelo canal.

**Efeito financeiro:** o valor original do pedido entra no total bruto.

### 3.4 Ajuste pós-venda

Depois do pagamento aprovado ocorreu cancelamento, devolução, reembolso parcial,
reembolso integral ou outro estorno confirmado.

**Efeito financeiro:** o valor original permanece no bruto e o ajuste é
registrado separadamente.

### 3.5 Faturamento preservado

É a parcela da venda reconhecida que continua sendo receita depois dos ajustes
pós-venda.

### 3.6 Repasse líquido

É o valor esperado ou efetivamente repassado ao vendedor depois de tarifas,
comissões, frete, impostos, subsídios e demais componentes financeiros do canal.

Repasse líquido não é sinônimo de faturamento confirmado.

## 4. Princípios invariáveis

1. Um pedido só se torna venda quando houver evidência confiável de pagamento
   aprovado.
2. O status atual do pedido não é suficiente para comprovar seu histórico
   financeiro.
3. Um cancelamento sem pagamento não é cancelamento financeiro.
4. Um cancelamento depois do pagamento é um ajuste financeiro integral.
5. O valor original do pedido deve ser preservado e nunca substituído pelo valor
   líquido ou pelo valor restante.
6. Reembolsos devem ser registrados separadamente do valor original.
7. Nenhum valor pode ser contabilizado duas vezes.
8. Dado ausente, nulo ou desconhecido não pode gerar faturamento por suposição.
9. Dado incompleto não pode interromper a coleta dos demais pedidos.
10. Todo valor exibido deve ser explicável e auditável por pedido.

## 5. Ordem obrigatória de classificação

Para cada pedido, o CRM deve responder às perguntas abaixo nesta ordem.

### 5.1 O canal chegou a gerar um pedido?

- **Não:** permanece como carrinho ou intenção, fora do CRM financeiro.
- **Sim:** o pedido pode ser armazenado e acompanhado, mas ainda não é uma
  venda.

### 5.2 Houve pagamento aprovado em algum momento?

São evidências aceitáveis:

- pagamento com status aprovado;
- valor efetivamente pago maior que zero;
- data de aprovação ou crédito informada pelo canal;
- status de pedido que o contrato do canal define inequivocamente como pago.

Sem uma dessas evidências, o pedido permanece fora dos cálculos financeiros.

### 5.3 O pagamento sofreu um ajuste posterior?

O CRM deve identificar separadamente:

- cancelamento integral;
- devolução integral;
- reembolso integral;
- reembolso parcial;
- contestação ou chargeback confirmado.

### 5.4 Quanto da venda foi preservado?

```text
valor preservado = valor original reconhecido - ajustes confirmados
```

O resultado nunca pode ser negativo.

## 6. Matriz geral de reconhecimento

| Situação | Classificação | Reconhece venda | Total bruto | Faturamento confirmado | Ajuste financeiro |
|---|---|---:|---:|---:|---:|
| Produto apenas no carrinho | Intenção | Não | R$ 0 | R$ 0 | R$ 0 |
| Checkout iniciado | Tentativa | Não | R$ 0 | R$ 0 | R$ 0 |
| Pedido criado sem pagamento | Não convertido | Não | R$ 0 | R$ 0 | R$ 0 |
| Pagamento em processamento | Pendente | Não | R$ 0 | R$ 0 | R$ 0 |
| Pagamento recusado | Não convertido | Não | R$ 0 | R$ 0 | R$ 0 |
| Pagamento expirado | Não convertido | Não | R$ 0 | R$ 0 | R$ 0 |
| Pagamento aprovado | Venda reconhecida | Sim | Valor original | Valor original | R$ 0 |
| Pedido em preparação ou envio | Venda reconhecida | Sim | Valor original | Valor original | R$ 0 |
| Pedido entregue ou concluído | Venda reconhecida | Sim | Valor original | Valor original | R$ 0 |
| Reembolso parcial | Ajuste parcial | Sim | Valor original | Parte preservada | Parcela reembolsada |
| Cancelamento após pagamento | Ajuste integral | Sim | Valor original | R$ 0 | Valor original |
| Devolução integral | Ajuste integral | Sim | Valor original | R$ 0 | Valor original |
| Reembolso integral | Ajuste integral | Sim | Valor original | R$ 0 | Valor original |
| Cancelamento sem pagamento | Não convertido | Não | R$ 0 | R$ 0 | R$ 0 |

## 7. Fórmulas oficiais

Considere:

- `VO`: valor original do pedido;
- `PA`: existência de pagamento aprovado;
- `AI`: valor de ajuste integral confirmado;
- `RP`: valor de reembolso parcial confirmado;
- `VP`: valor preservado.

### 7.1 Valor bruto reconhecido por pedido

```text
se PA = não, bruto reconhecido = 0
se PA = sim, bruto reconhecido = VO
```

### 7.2 Valor preservado por pedido

```text
se PA = não, VP = 0
se AI = VO, VP = 0
caso contrário, VP = máximo entre 0 e VO - RP
```

### 7.3 Total bruto comparável

```text
total bruto comparável
= soma do VO de todos os pedidos que tiveram pagamento aprovado
```

### 7.4 Ajustes pós-venda

```text
ajustes pós-venda
= cancelamentos integrais após pagamento
+ devoluções integrais após pagamento
+ reembolsos integrais após pagamento
+ reembolsos parciais
```

### 7.5 Faturamento confirmado

```text
faturamento confirmado
= total bruto comparável - ajustes pós-venda
```

### 7.6 Repasse líquido

```text
repasse líquido
= faturamento confirmado
- tarifas
- comissões
- custos de frete
- impostos
- outros descontos
+ subsídios
+ outros acréscimos
```

## 8. Regras dos cards do módulo Vendas

Os seis cards são permanentes. Quando não houver valor ou quantidade, devem
continuar visíveis com zero.

### 8.1 Total bruto comparável

**Objetivo:** reproduzir o valor bruto reconhecido pelo canal no mesmo período e
com os mesmos filtros.

**Inclui:**

- valor original de todo pedido que teve pagamento aprovado;
- pedido pago que foi cancelado posteriormente;
- pedido pago que foi devolvido posteriormente;
- pedido pago que recebeu reembolso parcial ou integral.

**Não inclui:**

- carrinho;
- checkout abandonado;
- pedido aguardando pagamento;
- pagamento recusado ou expirado;
- cancelamento sem pagamento;
- pedido ausente da sincronização;
- pedido fora da janela de datas selecionada.

### 8.2 Faturamento confirmado

**Objetivo:** mostrar quanto das vendas reconhecidas continua sendo receita.

**Inclui:**

- pedidos pagos;
- pedidos separados;
- pedidos enviados;
- pedidos entregues;
- pedidos concluídos;
- parcela preservada de pedidos parcialmente reembolsados.

**Não inclui:**

- pedidos sem pagamento confirmado;
- cancelamentos integrais;
- devoluções integrais;
- reembolsos integrais;
- parcela já reembolsada de um pedido.

### 8.3 Pedidos faturados

**Objetivo:** contar pedidos que tiveram pagamento aprovado e ainda preservam
receita.

Regras:

- cada pedido conta uma vez;
- a quantidade de produtos ou unidades não altera a contagem;
- um pedido parcialmente reembolsado conta uma vez se ainda preservar receita;
- pedido totalmente estornado não entra na quantidade preservada.

### 8.4 Cancelados e devolvidos

**Objetivo:** mostrar os ajustes integrais posteriores ao pagamento.

O valor financeiro inclui somente:

- cancelamento depois do pagamento;
- devolução integral depois do pagamento;
- reembolso integral depois do pagamento.

Cancelamentos sem pagamento podem ser exibidos como informação operacional, mas
devem ter impacto financeiro zero. O detalhamento deve separar:

```text
cancelamentos financeiros = tiveram pagamento aprovado
expirados sem pagamento = nunca se tornaram venda
```

### 8.5 Reembolsos parciais

**Objetivo:** mostrar a parcela devolvida de pedidos que continuam preservando
alguma receita.

Regras:

- considerar somente valores positivos explicitamente informados pelo canal;
- somar todos os pagamentos reembolsados do mesmo pedido;
- contar o pedido uma vez, ainda que existam vários pagamentos;
- não estimar valor quando a API não informar o reembolso;
- não duplicar reembolso já classificado como ajuste integral.

### 8.6 Diferença de fuso

**Objetivo:** explicar pedidos reconhecidos pelo canal e pelo CRM em lados
diferentes da virada do período.

Regras:

- usar os mesmos critérios financeiros do total bruto comparável;
- não incluir pedidos sem pagamento;
- informar valor, quantidade, IDs e horários envolvidos;
- deixar explícitos o fuso e a janela usados por cada lado;
- permanecer visível com valor e quantidade zero quando não houver diferença.

## 9. Normalização entre marketplaces

Cada provider deve traduzir os estados externos para conceitos internos comuns.
O nome recebido da API pode variar, mas a consequência financeira não pode
variar.

| Conceito interno | Exemplos de status externos | Reconhecimento |
|---|---|---|
| Aguardando pagamento | `unpaid`, `to_pay`, `payment_required`, `payment_pending` | Não faturável |
| Pagamento em processamento | `payment_in_process`, `partially_paid`, `pending` | Não faturável |
| Pago | `paid`, `approved`, `payment_done` | Faturável |
| Preparando | `ready_to_ship`, `processed`, `invoiced` | Faturável se o canal já confirmou pagamento |
| Enviado | `shipped`, `collected`, `partially_collected`, `in_transit` | Faturável se o canal já confirmou pagamento |
| Entregue | `delivered`, `to_confirm_receive` | Faturável |
| Concluído | `completed` | Faturável |
| Cancelado | `cancelled`, `in_cancel`, `invalid` | Depende do histórico de pagamento |
| Devolvido | `returned`, `to_return`, `partially_returned` | Depende do histórico e da extensão da devolução |
| Reembolso parcial | `partially_refunded` | Bruto preservado e parcela ajustada |

Um status novo ou desconhecido nunca deve ser considerado faturável
automaticamente.

## 10. Evidência financeira e precedência

Quando houver divergência entre campos, aplicar esta ordem de confiança:

1. pagamento individual explicitamente aprovado;
2. valor pago ou creditado positivo confirmado pelo canal;
3. evento financeiro assinado ou consultado diretamente na API;
4. status de pedido definido pelo contrato do canal como inequivocamente pago;
5. estado derivado ou inferido pelo CRM.

Status genéricos como `created`, `confirmed`, `pending` ou equivalentes não são
prova de pagamento.

## 11. Tratamento de dados nulos ou incompletos

### 11.1 Status ausente ou desconhecido

- armazenar o pedido e o payload bruto;
- classificar conservadoramente como pendente;
- não reconhecer faturamento;
- registrar log estruturado e pendência de reconciliação;
- tentar complementar o pedido em sincronização posterior.

### 11.2 Valor original ausente

- não interromper o lote;
- não incluir o pedido na soma financeira;
- não transformar silenciosamente a ausência em venda de valor zero;
- registrar o motivo da exclusão;
- consultar novamente o detalhe do pedido.

### 11.3 Pagamentos ausentes

Se o status do pedido também não comprovar pagamento:

- tratar como pagamento não confirmado;
- manter fora do faturamento.

Se existir status financeiro confiável como `paid`:

- reconhecer conforme o contrato do canal;
- registrar que o detalhamento dos pagamentos está incompleto;
- tentar complementar os dados posteriormente.

### 11.4 Reembolso ausente ou inválido

- não estimar valor;
- considerar zero apenas para o cálculo defensivo atual;
- preservar o último valor válido conhecido;
- registrar pendência para reconciliação;
- nunca apagar faturamento válido apenas por ausência de um campo.

## 12. Datas, períodos e fuso horário

Para comparar o CRM com o painel oficial:

1. usar a mesma data de referência adotada pelo indicador do canal;
2. aplicar o mesmo início e fim de período;
3. aplicar o fuso oficial usado pelo painel;
4. registrar separadamente a data de criação, aprovação, atualização e ajuste;
5. não compensar divergência de fuso alterando o reconhecimento financeiro;
6. demonstrar no card de fuso quais pedidos mudam de lado.

A data define em qual período o pedido aparece. Ela não define se o pedido é ou
não uma venda. O reconhecimento continua dependendo do pagamento.

## 13. Responsabilidades por camada

### Provider do canal

- buscar pedido e pagamentos na fonte oficial;
- preservar status e payload originais;
- normalizar campos sem decidir fórmulas de apresentação;
- registrar status externos desconhecidos;
- não descartar o lote por falha isolada.

### Domínio de Vendas

- centralizar a lista positiva de estados faturáveis;
- determinar se houve pagamento aprovado;
- classificar ajustes integrais e parciais;
- calcular valor bruto e valor preservado;
- impedir dupla contabilização.

### Repositório

- aplicar a mesma regra do domínio nas consultas agregadas;
- manter `pedido.total` como valor original;
- derivar ajustes dos dados oficiais disponíveis;
- retornar contagens e valores separados.

### Aplicação e jobs

- reconciliar pedidos usando a data de última atualização;
- repetir consultas incompletas sem duplicar pedidos;
- registrar falhas por pedido;
- preservar o último dado válido quando a fonte responder parcialmente.

### Frontend

- apenas apresentar os valores calculados pelo servidor;
- não recriar regras financeiras no componente;
- manter os seis cards visíveis, inclusive com zero;
- explicar cálculo, inclusões, exclusões e data de atualização;
- permitir auditoria até o pedido de origem.

## 14. Campos necessários por pedido

O CRM deve obter, armazenar ou derivar:

```text
ID externo do pedido
canal
conta do canal
empresa
status externo
status interno
valor original
teve pagamento aprovado
valor efetivamente pago
valor reembolsado
valor preservado
tipo de ajuste
data de criação
data de aprovação
data da última atualização
data do cancelamento, devolução ou reembolso
payload original
motivo da classificação financeira
```

O conceito decisivo é `teve pagamento aprovado`. Ele não deve ser deduzido
apenas do status final.

## 15. Motivos de classificação e auditoria

Cada pedido deve poder expor um motivo equivalente a um destes códigos:

| Código | Significado |
|---|---|
| `SEM_PEDIDO` | Carrinho ou intenção não gerou pedido consultável |
| `AGUARDANDO_PAGAMENTO` | Pedido existe, mas não há confirmação financeira |
| `PAGAMENTO_RECUSADO` | Tentativa recusada pelo meio de pagamento |
| `PAGAMENTO_EXPIRADO` | Prazo terminou sem aprovação |
| `PAGAMENTO_APROVADO` | Venda reconhecida pelo canal |
| `CANCELADO_SEM_PAGAMENTO` | Cancelamento operacional sem venda reconhecida |
| `CANCELADO_APOS_PAGAMENTO` | Ajuste integral de uma venda reconhecida |
| `DEVOLVIDO_APOS_PAGAMENTO` | Devolução integral de uma venda reconhecida |
| `REEMBOLSO_PARCIAL` | Parcela devolvida com receita remanescente |
| `REEMBOLSO_INTEGRAL` | Toda a venda foi estornada |
| `DADO_FINANCEIRO_INCOMPLETO` | A fonte não forneceu evidência suficiente |
| `STATUS_EXTERNO_DESCONHECIDO` | A integração recebeu um estado ainda não mapeado |

Logs e auditorias não devem incluir tokens, dados pessoais desnecessários ou o
payload integral quando ele contiver informações sensíveis.

## 16. Exemplos de cálculo

### 16.1 Checkout abandonado

```text
valor apresentado no checkout: R$ 100,00
pagamento aprovado: não

total bruto comparável: R$ 0,00
faturamento confirmado: R$ 0,00
cancelamentos financeiros: R$ 0,00
```

### 16.2 Venda sem ajustes

```text
valor original: R$ 100,00
pagamento aprovado: sim
ajustes: nenhum

total bruto comparável: R$ 100,00
faturamento confirmado: R$ 100,00
```

### 16.3 Venda cancelada após pagamento

```text
valor original: R$ 100,00
pagamento aprovado: sim
cancelamento integral: sim

total bruto comparável: R$ 100,00
faturamento confirmado: R$ 0,00
cancelados e devolvidos: R$ 100,00
```

### 16.4 Venda parcialmente reembolsada

```text
valor original: R$ 100,00
pagamento aprovado: sim
reembolso parcial: R$ 30,00

total bruto comparável: R$ 100,00
faturamento confirmado: R$ 70,00
reembolsos parciais: R$ 30,00
```

### 16.5 Dois pagamentos com reembolso parcial

```text
valor original: R$ 150,00
pagamento aprovado 1: R$ 100,00
pagamento aprovado 2: R$ 50,00
reembolso no pagamento 1: R$ 20,00
reembolso no pagamento 2: R$ 10,00

total bruto comparável: R$ 150,00
faturamento confirmado: R$ 120,00
reembolsos parciais: R$ 30,00
pedidos faturados: 1
```

## 17. Evidência verificada no Mercado Livre

Na conta WUWU, no período de 05/08/2026 a 04/09/2026, uma consulta de leitura
realizada em 04/09/2026 encontrou:

```text
1.617 pedidos
R$ 63.857,13 de valor bruto
1.540 com status paid
75 com status cancelled
2 com status partially_refunded
```

Os 75 pedidos cancelados, somando R$ 2.630,86, possuíam evidência de pagamento
aprovado ou valor pago positivo. Não foi encontrado cancelamento sem pagamento
compondo o total bruto dessa amostra.

Essa evidência confirma que, para o indicador observado, pedidos pagos e
posteriormente cancelados permanecem no bruto. Ela não autoriza assumir que todo
status `cancelled`, em qualquer canal ou período, teve pagamento. A integração
deve sempre verificar a evidência financeira do próprio pedido.

## 18. Estado atual da implementação

Já existe no projeto:

- lista positiva de estados faturáveis em
  `src/modules/vendas/domain/status-faturamento.ts`;
- normalização defensiva dos status externos em
  `src/modules/canais/domain/order-status.ts`;
- cálculo defensivo de reembolso parcial em
  `src/modules/vendas/infrastructure/valor-faturamento.sql.ts`;
- preservação de `pedido.total` como valor bruto original;
- cards separados para bruto, faturamento, pedidos, cancelamentos, reembolsos e
  fuso;
- fallback conservador para status ausente ou desconhecido;
- sincronização incremental pela última atualização do pedido.
- classificação de cancelamentos financeiros pela evidência de pagamento
  aprovado preservada em `dados_origem`;
- exclusão de cancelamentos sem pagamento do total bruto, do card financeiro e
  da diferença de fuso;
- reconstrução da evidência para pedidos antigos do Mercado Livre a partir de
  `paid_amount` e do histórico de pagamentos já armazenado.

## 19. Critérios de aceite

A matriz estará integralmente atendida quando:

1. carrinho e checkout sem pedido não gerarem registro financeiro;
2. pedido sem pagamento nunca entrar no total bruto;
3. status desconhecido nunca entrar no faturamento automaticamente;
4. cancelamento sem pagamento tiver impacto financeiro zero;
5. cancelamento após pagamento permanecer no bruto e aparecer como ajuste;
6. reembolso parcial preservar o bruto e reduzir somente a receita confirmada;
7. reembolso integral zerar a receita preservada sem apagar o bruto;
8. valor nulo não interromper a coleta nem forçar uma classificação incorreta;
9. as consultas agregadas e a interface usarem a mesma regra;
10. cada valor puder ser explicado por uma lista de pedidos;
11. o período e o fuso usados na comparação estiverem visíveis;
12. os seis cards permanecerem estáveis mesmo quando seus valores forem zero;
13. os cenários acima estiverem protegidos por testes automatizados.

## 20. Regra final do projeto

> Nenhum pedido entra nos resultados financeiros antes de existir evidência
> confiável de pagamento aprovado. Depois do pagamento, o valor original
> permanece no total bruto e cancelamentos, devoluções ou reembolsos são
> registrados separadamente como ajustes pós-venda.

Esta regra é independente do marketplace e deve ser a fonte normativa para toda
implementação financeira relacionada a pedidos no CRM.
