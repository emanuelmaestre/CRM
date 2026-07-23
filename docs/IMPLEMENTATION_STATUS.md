# Estado de Implementação — CRM LEO

Atualizado em 22/07/2026. O `PRD.md` permanece como fonte da verdade dos requisitos. Os arquivos
`fase-a-dod.json` e `fase-b-dod.json` registram evidências verificáveis por fase.

## Regra de liberação

O sistema ainda não está liberado para go-live. `EXTERNAL_SENDS_ENABLED` deve permanecer `false`
até a homologação real dos conectores, do isolamento entre marcas e dos disparos externos.

## Estado atual

| Frente | Estado | Evidência / próximo gate |
|---|---|---|
| Fonte da verdade e baseline | concluída | tipos, lint, testes, migrations e build verdes |
| Segurança, banco e RLS | concluída | migration `0012` aprovada em banco limpo, aplicada e verificada no banco alvo |
| Pedido e estoque | pronta para homologação externa | ingestão por conta, advisory lock, baixa idempotente, sync e reconciliação testados localmente |
| Isolamento de marca | pronta para homologação externa | FK composta e resolução por conta/marca; falta ensaio real KARZI × WUWU |
| Conectores | pronta para homologação externa | ML, Shopee, TikTok v202309 e Olist implementados; faltam credenciais/contas reais |
| CRM operacional (Fase A) | concluída | aceite e evidências em `fase-a-dod.json` |
| Réguas e automações | pronta para homologação externa | seis gates aprovados no PostgreSQL; outbound real permanece bloqueado |
| Inbox unificado | parcial | persistência/deduplicação prontas; falta habilitar e homologar eventos oficiais de chat dos marketplaces |
| Observabilidade | parcial | painel e monitoramento A18/A24 prontos; falta Inngest publicado e operação real |
| IA e lapidação (Fase C) | pendente | fora do escopo da Fase B |

## Evidências de 22/07/2026

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem avisos.
- `npm test`: 18 arquivos e 99 testes aprovados.
- `npm run db:check`: aprovado.
- Migrations `0000`–`0012`: aplicadas com sucesso em PostgreSQL 17 limpo e no banco Supabase alvo.
- `npm run test:phase-b:integration`: aprovado; 50 tentativas concorrentes produziram 1 mensagem
  e 1 movimento de estoque.
- `npm run test:phase-b:gates`: 6/6 gates aprovados no banco real.
- `npm run test:seed-synthetic`: 27 conjuntos, 6 clientes e 6 pedidos; reexecução idempotente.
- `npm run test:rls`: 32 verificações aprovadas, incluindo isolamento e integridade relacional.
- `npm run build`: Next.js 16.2.11 aprovado com 37 rotas/páginas, incluindo pedidos e histórico
  de automações.
- Verificação em navegador: rota protegida redirecionou corretamente ao login, conteúdo renderizado
  e nenhum overlay de erro do Next.js.

## Gate contratual restante da Fase B

A implementação está pronta para homologação, mas a Fase B só pode ser marcada como concluída após:

1. conectar as contas reais por marca;
2. comprovar pedido real de cada canal em até cinco minutos;
3. conferir baixa e saldo remoto ponta a ponta;
4. homologar chat/perguntas oficiais dos marketplaces;
5. executar outbound aprovado sem duplicação, mantendo os seis gates ativos.
