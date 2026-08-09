# State Machines — CRM LEO

## Pedido

```
criado ──────┬──→ pago ──→ separado ──→ enviado ──→ entregue ──→ concluido
             │      │          │
             ▼      ▼          ▼
          cancelado ←──────────┘
             │
             ▼
         devolvido (apenas de: entregue)
```

**Arquivo:** `src/modules/vendas/domain/state-machine.ts`

| De | Para | Quem aciona |
|----|------|-------------|
| criado | pago | Confirmação de pagamento |
| criado | cancelado | Operador / timeout |
| pago | separado | Operador (picking) |
| pago | cancelado | Operador (antes de separar) |
| separado | enviado | Despacho (geração rastreio) |
| separado | cancelado | Operador (antes de enviar) |
| enviado | entregue | Webhook transportadora |
| entregue | concluido | Auto (7 dias) ou operador |
| entregue | devolvido | Operador (pós-entrega) |

Transições inválidas lançam `Error` — nunca são silenciadas.

## Conversa (inbox Mercado Livre)

```
nova ──→ em_atendimento ──⇄──→ aguardando_cliente
              │                        │
              └──────────────┬─────────┘
                             ▼
                        resolvida ──→ arquivada
```

**Arquivo:** `src/modules/inbox/domain/state-machine.ts`

| De | Para | Trigger |
|----|------|---------|
| nova | em_atendimento | Agente assume conversa |
| em_atendimento | aguardando_cliente | Agente envia mensagem |
| aguardando_cliente | em_atendimento | Cliente responde |
| em_atendimento | resolvida | Agente resolve |
| aguardando_cliente | resolvida | Auto (timeout 24h) |
| resolvida | arquivada | Auto (30 dias) |
| resolvida | em_atendimento | Cliente reabre (reopen) |
| arquivada | em_atendimento | Cliente reabre (reopen) |

`reabrirSeNecessario()` retorna `em_atendimento` se o status atual for `resolvida` ou `arquivada`.
