# Eventos de Domínio — CRM LEO

**Arquivo:** `src/shared/events/index.ts`

Todos os eventos são emitidos via `emitirEvento()` que persiste em `evento_dominio` e despacha para o Inngest.

## Lista de eventos (32)

### Clientes
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `cliente.criado` | clienteId, nome | — |
| `cliente.atualizado` | clienteId, campos | — |
| `cliente.consentimento-revogado` | clienteId | A11 |
| `cliente.duplicata_detectada` | clienteId, candidatos | — |

### Pedidos
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `pedido.criado` | pedidoId, clienteId | — |
| `pedido.pago` | pedidoId, orgId | A2 |
| `pedido.separado` | pedidoId | — |
| `pedido.enviado` | pedidoId, rastreio | — |
| `pedido.entregue` | pedidoId, orgId, brandId | A8 |
| `pedido.concluido` | pedidoId | — |
| `pedido.cancelado` | pedidoId, orgId, statusAnterior | A3 |
| `pedido.devolvido` | pedidoId | — |

### Estoque
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `estoque.baixa-automatica` | produtoId, orgId, novoSaldo | A6 |
| `estoque.minimo_atingido` | produtoId, sku, saldo, minimo | — (notificação) |
| `estoque.divergencia_detectada` | produtoId, saldo, motivo | — (alerta) |

### Réguas
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `regua.disparada` | reguaId, clienteId, gateResult | — |
| `regua.bloqueada_gate` | reguaId, gate, motivo | — |
| `regua.executada` | execucaoId, canal, status | — |

### Inbox
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `inbox.mensagem_recebida` | conversaId, mensagemId | — |
| `inbox.conversa_aberta` | conversaId, brandId | — |
| `inbox.conversa_resolvida` | conversaId | — |

### IA
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `ia.budget_70pct` | consumoUsd, limiteUsd | — (alerta) |
| `ia.budget_90pct` | consumoUsd, limiteUsd | — (alerta) |
| `ia.budget_esgotado` | consumoUsd | — (pausa automática) |
| `ia.sugestao_gerada` | sugestaoId | — (aguarda aprovação) |

### Sistema
| Evento | Payload | Job acionado |
|--------|---------|--------------|
| `sistema.conector_offline` | brandId, canal, motivo | — (alerta) |
| `sistema.conector_online` | brandId, canal | — |
| `sistema.job_falhou` | jobId, erro | — (alerta) |
