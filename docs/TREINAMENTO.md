# Treinamento — CRM LEO (KARZI, WUWU e Armarinhos Lima)

Este documento é o roteiro de treinamento exigido pela Fase 5 do contrato (§16 do PRD,
"Homologação e Go-live") e pelo portão de saída da Fase C. Ele serve como script para a sessão
ao vivo com a equipe do cliente e como roteiro de gravação do vídeo de treinamento. A gravação em
si e a sessão ao vivo dependem da disponibilidade da equipe do cliente — ver
`docs/fase-c-dod.json` (`training_go_live`, `pendente_externo`).

## Como usar este roteiro

- Cada bloco tem duração estimada, tela a mostrar e o que dizer/demonstrar.
- Use dados de staging/sintéticos na gravação — nunca dados reais de cliente final antes do
  aceite de go-live.
- Grave em blocos curtos (um por perfil) para facilitar atualização quando o produto mudar.

## Sumário por perfil

| Perfil | Acessa | Bloco |
|---|---|---|
| Administrador | Tudo, incluindo `/admin`, `/configuracoes`, `/auditoria` | 1, 2, 3, 4, 5 |
| Gestor | Operação comercial, estoque, importação, relatórios | 1, 2, 3 |
| Vendedor | Clientes, vendas, estoque (sem custo/margem) | 1, 2 |

---

## Bloco 1 — Visão geral e navegação (todos os perfis, ~8 min)

Tela: `/dashboard`

1. Login e primeiro acesso — mostrar `/auth/login` e o redirecionamento por perfil.
2. Navegação principal: barra lateral/topo em desktop, barra inferior em mobile (breakpoints
   360/768/1024/1920 já testados — mostrar responsividade ao vivo redimensionando a janela).
3. Painel executivo: filtros por período/marca/canal, receita, pedidos, conversão, ticket médio,
   consumo de IA. Explicar que os números vêm do banco real, não de simulação.
4. Explicar o Invariante nº 1 do PRD: KARZI, WUWU e Armarinhos Lima nunca se cruzam — nenhuma tela mistura marcas
   sem o seletor explícito.

## Bloco 2 — Operação do dia a dia (gestor + vendedor, ~15 min)

Telas: `/clientes`, `/clientes/[id]`, `/vendas`, `/vendas/pedidos`, `/estoque`, `/inbox`, `/agenda`,
`/tarefas`

1. Clientes 360°: cadastro, timeline, consentimentos, exportação/revogação LGPD (mostrar que
   vendedor não vê custo/margem).
2. Funil de vendas: criar oportunidade, mover etapa, registrar tarefa.
3. Pedidos: lista `/vendas/pedidos` e detalhe `/vendas/pedidos/[id]` — mostrar itens, frete, total.
4. Estoque: livro-razão, baixa manual, alerta de estoque mínimo.
5. Inbox unificado: balões por canal, perguntas de marketplace, tempo de resposta.
6. Agenda e tarefas: criar evento, vincular a cliente/responsável.

## Bloco 3 — Importação e relatórios (gestor, ~10 min)

Telas: `/importacao`, `/relatorios`

1. Importação com prévia: subir CSV, revisar linhas aceitas/rejeitadas antes de confirmar.
2. Relatórios exportáveis: CSV, XLSX e PDF — mostrar os três formatos.
3. Explicar que todo relatório respeita RLS por org/perfil.

## Bloco 4 — Canais, réguas e automações (admin, ~15 min)

Telas: `/configuracoes`, `/admin/saude`, `/automacoes/historico`

1. Cadastro de conta de canal por marca (`channel_account`), sem expor token na tela.
2. Mapeamento SKU interno x anúncio/listing por canal.
3. Painel de saúde: status de conector, "Verificar agora", checklist de prontidão para go-live.
4. Histórico de automações: réguas disparadas, gates bloqueados e motivo — reforçar que **nenhuma
   régua dispara sem opt-in registrado** (Invariante nº 2).

## Bloco 5 — Administração, IA e LGPD (admin, ~15 min)

Telas: `/admin/lgpd`, `/admin/consumo-ia`, `/auditoria`, sugestões de campanha

1. LGPD: abrir solicitação, exportar pacote JSON, anonimizar com confirmação textual
   `ANONIMIZAR`.
2. Consumo de IA: custo por finalidade, corte suave de orçamento mensal, runs recentes.
3. Sugestões de campanha com aprovação: mostrar que toda sugestão exige aprovação humana antes de
   qualquer disparo (Invariante nº 4) — aprovar/rejeitar uma sugestão de exemplo.
4. Auditoria: trilha de quem fez o quê, quando, com o que mudou.

---

## Checklist de aceite pós-treinamento

- [ ] Equipe do cliente navegou ao vivo em pelo menos 1 fluxo de cada bloco aplicável ao seu perfil.
- [ ] Dúvidas registradas e respondidas (anexar ata ou print do chat).
- [ ] Vídeo gravado e compartilhado (link a preencher após a sessão).
- [ ] Este documento revisado e assinado como "material de treinamento entregue" — Cláusula 4.2.
- [ ] Checklist de go-live de `docs/fase-c-dod.json` revisado com o cliente.

## Após o treinamento

1. Atualizar `docs/fase-c-dod.json` → `training_go_live` para `concluido` com a data da sessão.
2. Anexar o link do vídeo e a ata de dúvidas neste arquivo (seção abaixo).
3. Seguir para o checklist de go-live do RUNBOOK (`docs/RUNBOOK.md`).

### Registro da sessão (preencher após execução)

| Data | Participantes | Blocos cobertos | Link do vídeo | Observações |
|---|---|---|---|---|
| _a preencher_ | | | | |
