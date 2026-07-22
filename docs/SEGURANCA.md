# Segurança — CRM LEO

## Autenticação

- Supabase Auth (JWT)
- `service_role` key somente server-side (env var, nunca exposta ao cliente)
- `anon` key usada apenas para auth pública

## Autorização

### Row Level Security (RLS)
Todas as tabelas têm RLS habilitado no Supabase.
Policy base: `org_id = current_setting('app.current_org_id')::uuid`

Teste de integração: `npm run test:rls`. A suíte usa a role `authenticated`, cria dois tenants
sintéticos dentro de transações revertidas e valida default deny, isolamento de leitura,
`INSERT`/`UPDATE`/`DELETE`, bloqueio de mudança de tenant e proteção do `audit_log`.

### Perfis de usuário
| Perfil | Acesso |
|--------|--------|
| admin | Tudo |
| gestor | Relatórios, réguas, IA — sem excluir |
| vendedor | Próprios clientes e pedidos |

`checkPerfil()` em `src/shared/lib/auth.ts` — validado em toda operação de escrita.

## Webhook Z-API

Header `x-api-token` validado contra `ZAPI_WEBHOOK_TOKEN` env var antes de qualquer processamento.
Payload validado com Zod (`ZApiWebhookSchema`) antes de tocar o banco.

## LGPD

- Tabela `consentimento` registra opt-in com data, canal e validade
- Gate 1 da régua verifica opt-in ativo antes de qualquer disparo
- Evento `cliente.consentimento-revogado` cancela execuções pendentes (job A11)
- `softDeleteById` — dados nunca são apagados fisicamente; `deletedAt` marca exclusão lógica

## IA — Cláusula 11.3

Todos os outputs de IA exibem aviso obrigatório:
> "⚠️ Este resultado é gerado por IA probabilística (Cláusula 11.3) — valide antes de agir."

Sugestões de campanha requerem aprovação humana antes de qualquer disparo.
`aprovarSugestao()` / `rejeitarSugestao()` são as únicas rotas de ação.

## Auditoria

`audit_log` — insert-only, nunca atualizado/deletado.
Campos: `entidade`, `entidadeId`, `acao`, `dadosAntes`, `dadosDepois`, `feitorPorId`, `feitorPerfil`, `createdAt`.

`llm_run` — registra cada chamada à OpenAI com modelo, tokens, custo e duração.

## Idempotência

- Réguas: `idempotency_key = {reguaId}:{clienteId}:{gatilho}:{yyyy-MM-dd}` — Gate 4 bloqueia duplicatas
- Inbox: `provider_message_id` — mensagens duplicadas do webhook são ignoradas

## Segredos

Nunca hardcode de secrets. Todas as chaves em variáveis de ambiente (ver RUNBOOK.md).
`.env.local` no `.gitignore`.
