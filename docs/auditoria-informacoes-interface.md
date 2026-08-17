# Auditoria das informações da interface

Escopo revisado em 17/08/2026: todos os gatilhos `Info`, `HelpCircle` e usos do
popover compartilhado de cálculo encontrados em `src/`.

## Indicadores com explicação acionável

| Local | Antes | Depois |
| --- | --- | --- |
| Saúde da loja — score consolidado | Fórmula e valores, sem definir o que a nota representa | Explica que é uma nota de 0 a 100, que resume todas as marcas e que o faturamento define o peso |
| Saúde da loja — score por marca | Fórmula dos pilares | Define os cinco aspectos medidos e como interpretar a nota de 0 a 100 |
| Atendimento — taxa de resposta | Divisão entre respondidas e recebidas | Explica que mede a cobertura do atendimento pré-venda, a direção desejável, a conta e a regra de agrupamento de mensagens |
| Publicações — conversão estimada | Divisão entre unidades e visitas | Explica o aproveitamento do tráfego, a direção desejável e por que o resultado é uma estimativa |
| Pós-venda — taxa de problemas | Divisão entre problemas e pedidos | Explica que mede cancelamentos e devoluções, que menor é melhor e que todos os pedidos entram na base |
| Faturamento — variação | Fórmula percentual | Explica crescimento/queda, sinal positivo/negativo, valores comparados e janelas equivalentes |
| Comparação — faturamento | Fórmula percentual | Explica o que variou entre períodos equivalentes e como interpretar o sinal |
| Comparação — pedidos | Fórmula percentual | Explica o que variou entre períodos equivalentes e como interpretar o sinal |
| Comparação — ticket médio | Fórmula percentual | Explica o que variou entre períodos equivalentes e como interpretar o sinal |
| Comparação — cancelamento | Diferença em pontos percentuais | Explica que resultado negativo é melhora e diferencia pontos percentuais de variação percentual |
| Marca a marca — margem líquida | Conta e ressalva de cobertura | Explica quanto da receita permanece após a comissão conhecida e como interpretar uma margem maior |
| Marca a marca — cancelamento | Conta sobre pedidos | Explica a saúde operacional, a direção desejável e por que cancelados fazem parte da base |
| Marca a marca — Top 5 | Participação dos líderes | Explica o risco de dependência dos cinco produtos líderes |
| Marca a marca — recorrência | Participação da receita recorrente | Explica retenção e deixa claro que a recorrência é calculada separadamente por marca |

Todos esses popovers agora apresentam a mesma ordem didática: **o que
significa**, **como é calculado**, **dados usados**, **período analisado** e
**importante**.

## Avisos e estados informativos

| Local | Antes | Depois |
| --- | --- | --- |
| Saúde da loja — “Como é calculado” | Texto curto sobre média ponderada | “Entenda o score” e explicação dos cinco pilares, escala, pesos e tratamento de dado ausente |
| Saúde da loja — leitura parcial | Ícone repetia semanticamente o aviso | Texto permanece completo; ícone é corretamente decorativo para leitores de tela |
| Histórico de anúncios — um dia | Aviso já correto, com ícone redundante | Mensagem preservada e ícone marcado como decorativo |
| Cliente — origem do endereço | “Vindo do último pedido” | Explica a origem no pedido mais recente disponível e alerta que outros pedidos podem usar outro endereço |
| Cliente — endereço pendente | Informava apenas que não havia dado | Explica por que está ausente e quando será preenchido automaticamente |
| Inbox — nenhuma pergunta | Ícone de ajuda era anunciado sem acrescentar conteúdo | Mensagem visível continua sendo a fonte da informação; ícone passa a ser decorativo |
| Inbox — selecione uma pergunta | Ícone de ajuda era anunciado sem acrescentar conteúdo | Instrução textual permanece clara; ícone passa a ser decorativo |

## Padrão visual e acessível

- Área de acionamento ampliada de 20×20 para 28×28 px.
- Borda, fundo e estados de hover/foco tornam a ajuda encontrável sem competir
  com o conteúdo principal.
- `aria-label` descreve o indicador específico.
- `title` oferece uma dica imediata no desktop.
- Popover limita a largura à tela para funcionar em celular.
- Ícones acompanhados de uma frase completa usam `aria-hidden`, evitando leitura
  duplicada por tecnologia assistiva.
