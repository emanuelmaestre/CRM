# ADR-001 - Monolito Modular Single-tenant

## Status

Aceita.

## Contexto

O PRD define o LEO como um único sistema administrativo para KARZI, WUWU e Armarinhos Lima,
com identidade externa separada por operação. O principal risco arquitetural é misturar identidade
em mensagens, documentos, templates ou canais.

## Decisao

Manter o sistema como monolito modular em Next.js, com Clean Architecture interna por modulo:

- `ui -> application -> domain`;
- `infrastructure` implementa portas externas;
- comunicacao entre modulos por servicos tipados e eventos de dominio;
- `org_id` em dados de cliente desde o inicio;
- `brand_id` obrigatorio em canais, produtos, templates e comunicacoes.

## Consequencias

- Deploy e operacao ficam simples.
- A fronteira de marca fica testavel em banco, dominio e UI.
- Providers externos podem trocar sem alterar regra de negocio.
- Multi-tenant futuro fica preparado, mas nao vira escopo atual.
