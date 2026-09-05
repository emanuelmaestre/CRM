# Auditoria somente leitura — Shopee e TikTok

## Aplicação autorizada posteriormente pelo usuário

Em 04/09, após autorização, foram reprocessados 537 pedidos existentes do TikTok pelo serviço de ingestão em modo histórico: Armarinhos 3, Karzi 7, WUWU 527. Nenhuma chamada de escrita ao marketplace. Nenhuma mudança em regras ou pedidos Mercado Livre. Não houve deploy.

O detalhe real do TikTok contém `paid_time`, que agora é preservado como prova positiva no normalizador (data numérica válida, positiva e não futura). O motivo de cancelamento também é preservado. Ausência de `paid_time` não é, sozinha, prova de falta de pagamento. Na recuperação foram excluídos financeiramente apenas cancelamentos sem evidência positiva e com motivo explícito `Pagamento atrasado por parte do cliente`, preservando qualquer evidência anterior pelo serviço existente.

Sete status WUWU foram reconciliados: seis enviados passaram a entregues e o pedido R$29,51 passou de criado para cancelado, sem entrar financeiramente. A correção NÃO consiste em adicionar R$29,51 ao CRM.

Resultado no mesmo corte de 20:25:59, após aplicação:

| Marca | Hoje | 7 dias | 30 dias |
|---|---:|---:|---:|
| Armarinhos | 0,00 | 45,26 | 162,77 |
| Karzi | 0,00 | 268,70 | 529,52 |
| WUWU | 958,02 | 7.945,10 | 17.845,93 |

Redução comprovada do bruto legado: Karzi R$126,89/30 dias; WUWU R$670,49/7 dias e R$1.905,03/30 dias. Foram preservados cancelamentos com pagamento: Karzi 3/R$224,42; WUWU 13/R$649,25.

Pendências: Karzi 1 cancelado/R$19,90 e WUWU 12/R$719,95 permanecem sem marcador e não foram reprocessados. Inclui um motivo em espanhol fora da correspondência exata conservadora do script. Ainda não afirmar equivalência ao GMV do Seller Center. Não foi comprovada nem corrigida a causa operacional recorrente dos atrasos de sincronização.

Shopee: ambiente LIVE, par PEDIDOS_LIVE ausente, par TEST presente. Não foram copiadas credenciais de teste nem alterado SHOPEE_ENV. A mensagem de erro agora distingue falta de configuração do app de falta de OAuth. Necessário fornecer SHOPEE_PARTNER_ID_PEDIDOS_LIVE e SHOPEE_PARTNER_KEY_PEDIDOS_LIVE por configuração segura, sem enviar segredos na conversa.

Validação: TypeScript sem erros, ESLint dos providers/teste sem erros; 677 testes de domínio passaram em 89 arquivos, incluindo os testes do Mercado Livre. Scripts de aplicação e verificação em scripts/aplicar-auditoria-tiktok.mts e scripts/verificar-aplicacao-tiktok.mts.

---

## Registro original da auditoria

Consulta iniciada em 04/09/2026, 20:25:59 Brasília. Nenhuma alteração em produção, tokens, pedidos, sincronização ou regras do Mercado Livre. Script: scripts/auditar-shopee-tiktok.mts.

Janelas explícitas por criação, conforme filtros atuais destes canais: Hoje = 04/09; 7 dias = 29/08–04/09; 30 dias = 06/08–04/09, até o horário de corte. Não foi validada a definição dos atalhos nos painéis oficiais. APIs consultadas enquanto a base pode receber atualizações concorrentes.

## Shopee

As duas marcas falharam ao listar pedidos: App Shopee Pedidos não conectado. Diagnóstico da configuração: obterShopeeAppCredenciais('pedidos') não fornece o par completo partnerId/partnerKey no ambiente carregado. obterTokenShopee funciona nas duas marcas; app Financeiro também tem configuração e token disponíveis. Portanto, não presumir necessidade de novo OAuth antes de corrigir o par do app.

Valores existentes no CRM, NÃO validados contra API:

| Marca | Hoje | 7 dias | 30 dias |
|---|---:|---:|---:|
| Armarinhos Lima | 0,00 | 653,34 | 997,75 |
| WUWU | 800,39 | 5.783,30 | 16.638,64 |

Karzi não possui Shopee na configuração de marcas. A constatação de configuração aplica-se ao processo local auditado; não prova que outro servidor tenha as mesmas variáveis.

Próximo ajuste: fornecer o par correto do app Pedidos para o ambiente ativo, validar consulta autenticada, executar reconciliação histórica e comparar totais. Não usar credenciais do app Catálogo ou Financeiro como substitutas.

## TikTok

Todas as consultas funcionaram. Nenhuma diferença de valor nos pedidos encontrados em ambos os lados. Sem pedidos extras do CRM nas janelas consultadas.

| Marca | Hoje bruto CRM | 7 dias bruto CRM | 30 dias bruto CRM |
|---|---:|---:|---:|
| Armarinhos Lima | 0,00 | 45,26 | 162,77 |
| Karzi | 0,00 | 268,70 | 656,41 |
| WUWU | 958,02 | 8.615,59 | 19.750,96 |

Armarinhos: IDs, valores e status coincidem; 0/1/3 pedidos. Karzi: IDs, valores e status coincidem; 0/2/8 pedidos. Porém os 30 dias de Karzi contêm 5 cancelados, R$371,21, sem marcador pagamentoAprovado. Faturáveis atuais: R$285,20.

WUWU Hoje: 35 faturáveis, R$958,02, coincidem. API contém ainda 6 UNPAID, R$146,20, que não são faturamento; um deles (585896555111220468, R$21,47) não estava na base. Isso não comprova falha financeira.

WUWU 7 dias: API 224 faturáveis = R$7.487,24; 30 cancelados = R$1.157,86. Soma dos dois R$8.645,10, R$29,51 acima do bruto CRM. WUWU 30 dias: API 451 faturáveis = R$16.476,73; 82 cancelados = R$3.303,74. Soma R$19.780,47, também R$29,51 acima do CRM.

Os R$29,51 correspondem exatamente ao pedido 585879432666907856: CRM criado, API cancelled. Esta soma reproduz a regra legada de incluir cancelados; NÃO demonstra que esses cancelamentos devam entrar no GMV do painel.

Outros seis pedidos têm CRM enviado/API delivered, sem diferença monetária: 585777470352033313, 585810298536035702, 585844226905180040, 585844521964045737, 585845460942226695, 585857269551367741. O primeiro está apenas na janela de 30 dias.

Todos os cancelados TikTok consultados estão sem marcador pagamentoAprovado no banco. pagamentoAprovadoPedidoSql mantém fallback true para legado não-ML. O normalizador TikTok não preserva data/prova de pagamento; possuir objeto payment com total não foi tratado nesta auditoria como prova de aprovação.

Próximos ajustes propostos, não executados:

1. Reconciliar atualizações de status do TikTok e verificar o caminho de sincronização que deixou estes pedidos atrasados.
2. Consultar evidência oficial de pagamento/reembolso dos cancelados, preservá-la no normalizador TikTok e enriquecer o histórico antes de modificar a inclusão financeira. Não excluir ou incluir todos por suposição.
3. Validar definição de bruto/GMV e datas com relatório do Seller Center, pois soma de pedidos da API não prova equivalência ao painel.
4. Implementar ajustes por canal, com testes que preservem o comportamento do Mercado Livre.
