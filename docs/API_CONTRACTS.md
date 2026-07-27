# API Contracts - CRM LEO

Este documento registra os contratos das bordas HTTP do CRM. O PRD exige que toda fronteira tenha
validacao, erro visivel e isolamento por org/marca.

## Regras Globais

- Rotas de app usam sessao Supabase e `getCrudContext()`.
- Rotas publicas/webhooks validam assinatura, tamanho e schema antes de persistir.
- Payloads externos nunca devem conter segredo em log, auditoria ou resposta.
- Toda alteracao de estado deve emitir auditoria e/ou evento de dominio.
- `EXTERNAL_SENDS_ENABLED` precisa permanecer `false` ate homologacao final.

## Autenticacao e Provisionamento

| Rota | Metodo | Uso | Contrato |
|---|---|---|---|
| `/api/provision` | `POST` | Provisionamento controlado de usuario/org inicial | Requer segredo interno configurado; cria usuario/perfil sem expor senha em log. |
| `/auth/login` | UI | Login Supabase | Email/senha; redireciona para dashboard ou acesso negado. |

## Inngest

| Rota | Metodo | Uso | Contrato |
|---|---|---|---|
| `/api/inngest` | `GET/POST/PUT` | Registro e execucao de jobs A1-A24 | Requer `INNGEST_SIGNING_KEY` e `INNGEST_EVENT_KEY` em ambiente real. |

## Mercado Livre

| Rota | Metodo | Uso | Contrato |
|---|---|---|---|
| `/api/ml/connect` | `GET` | Inicio OAuth Mercado Livre | Gera URL de autorizacao por marca/conta. |
| `/api/ml/callback` | `GET` | Callback OAuth | Persiste referencia segura de token em `channel_account`. |
| `/api/ml/status` | `GET` | Estado da conexao | Retorna status sem expor token. |
| `/api/webhooks/mercadolivre` | `POST` | Eventos ML | Valida origem, normaliza pedido/pergunta e enfileira ingestao. |

## Marketplaces

| Rota | Metodo | Uso | Contrato |
|---|---|---|---|
| `/api/webhooks/shopee` | `POST` | Eventos Shopee | Verifica assinatura, busca detalhe oficial quando necessario e normaliza pedido. |
| `/api/webhooks/tiktokshop` | `POST` | Eventos TikTok Shop | Verifica assinatura, suporta eventos de pedido e mensagens/perguntas. |
| `/api/webhooks/olist` | `POST` | Eventos Olist | Valida resource oficial e seller configurado antes de persistir. |
| `/api/tiktok-verify` | `GET` | Verificacao TikTok | Responde challenge/verify token conforme politica do provedor. |

## WhatsApp Z-API

| Rota | Metodo | Uso | Contrato |
|---|---|---|---|
| `/api/webhooks/zapi` | `POST` | Mensagens WhatsApp | Valida token de webhook por marca, normaliza telefone e cria conversa/mensagem. |

## Server Actions Internas

As paginas do App Router usam server actions em vez de rotas REST publicas para CRUDs internos.
Essas actions devem:

- chamar `getCrudContext()`;
- validar input com Zod ou schema equivalente;
- aplicar `assertPerfil`;
- revalidar rotas afetadas;
- retornar apenas dados necessarios para a UI.

## Erros Padronizados

- `401/403`: acesso negado, perfil insuficiente ou sessao ausente.
- `400`: schema invalido, assinatura invalida ou payload fora do contrato.
- `409`: idempotencia/duplicidade ou transicao de estado recusada.
- `422`: dado externo reconhecido, mas inconsistente com org/marca/produto.
- `500`: falha inesperada; deve ir para Sentry/log estruturado e painel de saude quando aplicavel.

## Pendencias de Homologacao

- Confirmar assinatura real de cada webhook com contas oficiais.
- Registrar payloads reais anonimizados como fixtures.
- Documentar exemplos finais de erro por provider apos homologacao.
