# PRD — CRM Inteligente Plast Leo
### Central de clientes, estoque e vendas multicanal para KARZI, WUWU e Armarinhos Lima

| | |
|---|---|
| **Produto** | CRM Inteligente — Plano Acelera |
| **Codinome interno** | `LEO` |
| **Repositório** | https://github.com/emanuelmaestre/CRM.git |
| **Versão do documento** | 2.2 (inclusão da operação Armarinhos Lima) |
| **Data** | 31/07/2026 |
| **Contratante** | Plast Leo Limitada (indústria) — ambiente administrativo de KARZI, WUWU e Armarinhos Lima |
| **Contratada** | Emanuel Maestre dos Santos — Desenvolvedor de Software |
| **Base contratual** | Contrato de 17/07/2026 + Anexo I (Plano Acelera) |
| **Prazo estimado** | 8 semanas a partir do recebimento de acessos e dados |
| **Garantia** | 90 dias a partir do go-live |
| **Status** | Fase A concluída — fundação, núcleo, segurança e staging homologados |

> **Como ler este documento:** ele usa termos técnicos porque é a fonte da verdade da engenharia,
> mas todo termo difícil vem acompanhado de um balão 💡 explicando em palavras simples.
> **Regra de ouro:** só é exigível o que está no Contrato e no Anexo I. Este PRD detalha *como*
> entregar aquilo com excelência — ele não amplia escopo. Funcionalidade nova = **Evolução**
> (Cláusula 4.3), com aprovação de prazo e valor.

---

## Índice

0. Decisão Oficial de Produto
1. Visão Geral (problema, valor, escopo negativo)
2. Personas, Dispositivos e Responsividade
3. Rastreabilidade contratual → requisitos
4. Princípios de Engenharia
5. Arquitetura (stack, diagrama, Clean Architecture modular)
6. Modelo de Domínio
7. Máquinas de Estado
8. Sistema de Eventos
9. Módulos Funcionais (M1–M7)
10. Catálogo de Automações
11. Camada de Inteligência (OpenAI)
12. Segurança da Informação e Governança Operacional
13. Observabilidade e Custos de Ferramentas
14. Design System "Sinal Duplo" (cores, UI, UX, motion, balões)
15. Plano de Implantação em 3 Fases (Claude Code)
16. Cronograma contratual (5 fases do contrato)
17. Documentação viva
18. Plano de Testes e Critério de Pronto (DoD)
19. Invariantes não-negociáveis
20. Riscos e mitigação
21. Métricas de sucesso
22. Checklist de revisão final deste PRD

---

## 0. Decisão Oficial de Produto

**O LEO é um monólito modular com Clean Architecture interna, single-tenant e multi-marca.**

💡 *Em palavras simples: um único sistema (não vários sistemas separados), organizado por dentro
em "gavetas" independentes (módulos), servindo um único grupo administrativo que opera KARZI,
WUWU e Armarinhos Lima com separação obrigatória por `brand_id`.*

1. **Um ambiente, três operações.** KARZI, WUWU e Armarinhos Lima são administradas no mesmo
   CRM, separadas *de propósito* para que os clientes finais nunca recebam identidade de outra operação. Isso gera um
   requisito de produto que atravessa o sistema inteiro — o **sigilo entre marcas**:
   - Nenhuma comunicação externa (mensagem, e-mail, documento, avaliação, remetente, assinatura,
     domínio de link) pode misturar ou revelar a outra marca.
   - Templates, remetentes e identidades visuais são 100% segregados por marca.
   - *Por dentro*, o gestor vê tudo unificado (essa é a vantagem competitiva: saber que o mesmo
     comprador consome mais de uma operação). *Por fora*, cada identidade permanece independente.
   - Isso é o **Invariante nº 1** do sistema (seção 19).
2. **Single-tenant, multi-tenant-ready.** Um deploy, um banco, um cliente. O modelo de dados
   carrega `org_id` desde o dia 1 (valor fixo = grupo administrativo atual) para que este core vire produto
   revendável no futuro, sem nunca construir feature multi-empresa agora.
   💡 *"Tenant" = inquilino. Um sistema multi-tenant hospeda várias empresas isoladas; o LEO
   hospeda uma, mas já nasce com a fundação preparada.*
3. **IA que sugere, humano que decide.** O plano Acelera prevê IA *preditiva* (analisa e propõe).
   Agente que conversa e vende sozinho é do plano Domina e está **fora** deste escopo.
4. **Simplicidade disciplinada** (lição do ChronosLab): nada de microserviço, nada de abstração
   especulativa. Cada linha deste PRD tem prioridade **P0** (contratual, bloqueia go-live),
   **P1** (contratual, entra na calibração pós-go-live) ou **P2** (melhoria, não prometida).

---

## 1. Visão Geral

### 1.1 Problema
O grupo administra KARZI, WUWU e Armarinhos Lima em vários canais (marketplaces, redes sociais, WhatsApp) com:
estoque desconectado da venda, clientes espalhados sem histórico único, conversas esquecidas,
recompra dependente de memória, trabalho manual repetitivo, reputação sem gestão ativa e
decisões sem números por canal/campanha/vendedor.

### 1.2 Proposta de valor
Uma central única de clientes, estoque e vendas conectada a todos os canais, com uma camada de
inteligência que antecipa: quem vai parar de comprar, o que vai encalhar, quem abordar, quando e
com qual oferta — sempre dentro da LGPD, das políticas de cada plataforma e do sigilo entre marcas.

### 1.3 O que o sistema NÃO é (escopo negativo)
- **Não é ERP** — não emite NF-e, não faz contabilidade nem folha.
- **Não é agente autônomo** — não conversa nem vende sozinho (plano Domina).
- **Não produz conteúdo de marketing** — textos das réguas são fornecidos pelo cliente.
- **Não cria contas em terceiros** — verificações e homologações são da contratante (apoio consultivo incluso).
- **Não garante resultado comercial** — a IA é probabilística (Cláusula 11.3); decisões de
  desconto e campanha são validadas pela Plast Leo.

---

## 2. Personas, Dispositivos e Responsividade

O sistema será acessado **de literalmente qualquer dispositivo**. Responsividade não é acabamento:
é requisito P0 com dimensões definidas e testadas.

### 2.1 Personas × dispositivos

| Persona | Perfil | Necessidades | Dispositivos típicos |
|---|---|---|---|
| **Dono/Gestor** | `admin` | Painel executivo, relatórios por marca/canal, aprovações, auditoria, saúde do sistema | Desktop, notebook, celular (conferência rápida) |
| **Gestor comercial** | `gestor` | Funil, estoque, campanhas, sugestões da IA, equipe | Notebook, tablet, celular |
| **Vendedor/Atendente** | `vendedor` | Inbox unificado, ficha do cliente, tarefas, agenda | Celular (principal), tablet, desktop |
| **Cliente final** | — (não loga) | Receber a mensagem certa, no canal certo, da marca certa, só com consentimento | WhatsApp/e-mail |

### 2.2 Grade de breakpoints (dimensões oficiais)

💡 *Breakpoint = ponto de largura de tela em que o layout muda de forma para continuar confortável.*

| Faixa | Largura (px) | Dispositivo de referência | Comportamento do layout |
|---|---|---|---|
| `xs` | 320 – 479 | celulares compactos (320×568, 360×640) | 1 coluna; navegação inferior (bottom-nav) com 4 itens + "mais"; tabelas viram cartões; ações primárias em botão fixo inferior |
| `sm` | 480 – 767 | celulares grandes (390×844, 414×896, 430×932) | 1 coluna com cards maiores; inbox em painel único (lista → conversa com transição) |
| `md` | 768 – 1023 | tablet retrato (768×1024, 820×1180) | 2 colunas; sidebar colapsada em ícones; formulários em grade 2×; gráficos lado a lado |
| `lg` | 1024 – 1279 | tablet paisagem / notebook 13" (1024×768, 1280×800) | sidebar expansível; inbox em split-view (lista + conversa); tabelas completas com colunas prioritárias |
| `xl` | 1280 – 1535 | notebook 14–15" (1366×768, 1440×900) | layout completo; painel com grade de 12 colunas |
| `2xl` | ≥ 1536 | desktop/monitor (1920×1080, 2560×1440) | largura máxima de conteúdo 1440px centralizada; densidade "confortável"; painéis laterais persistentes (detalhe do cliente ao lado da lista) |

### 2.3 Regras de responsividade (valem para toda tela)

- **Mobile-first**: toda tela nasce no `xs` e ganha camadas para cima — nunca o contrário.
- **Alvos de toque ≥ 44×44px**; espaçamento mínimo de 8px entre alvos.
- **Tabela → cartão**: abaixo de `md`, listas tabulares viram cartões com os 3 campos mais
  importantes + expansão.
- **Inbox**: painel único até `md`; split-view (lista + conversa) a partir de `lg`;
  três painéis (lista + conversa + ficha do cliente) em `2xl`.
- **Gráficos** redimensionam e trocam de tipo quando necessário (linha densa vira sparkline no celular).
- **PWA instalável** (padrão já validado no Viratour): ícone na tela inicial, modo standalone,
  funciona como "app" no celular do vendedor. 💡 *PWA = site que se instala e se comporta como aplicativo.*
- **Teste obrigatório** (DoD): cada tela é verificada em 360, 768, 1024 e 1920 px antes do aceite.
- Zoom do navegador até 200% sem quebra (acessibilidade).

---

## 3. Rastreabilidade contratual → requisitos

Todo requisito P0/P1 nasce de uma linha do Anexo I:

| Anexo I | Módulo deste PRD | Prioridade |
|---|---|---|
| 01 · Gestão de clientes e relacionamento | M1 — Clientes 360º | P0 |
| 02 · Estoque | M2 — Estoque sincronizado | P0 |
| 03 · Integrações e canais | M3 — Conectores | P0 (faseado por canal) |
| 04 · Relacionamento e campanhas | M4 — Réguas | P0 |
| 05 · IA preditiva | M5/§11 — Inteligência | P0/P1 |
| 06 · Relatórios e gestão | M6 — Painel e relatórios | P0 |
| 07 · Segurança, conformidade e migração | M7/§12 — Segurança + Importação | P0 |

Cláusulas com efeito direto de engenharia: **2.4/10.x** (terceiros → conectores atrás de interface,
degradação visível), **4.2** (aceite por homologação → checklist assinável por fase), **6.2/6.3**
(consumo ordinário → medição de custo é feature, seção 13), **9.6/9.7** (credenciais sob guarda da
contratada → vault), **12.x** (LGPD → consentimento auditável), **15.1** (portabilidade na saída →
migrations e docs vivos desde o dia 1).

---

## 4. Princípios de Engenharia

1. **Correção acima de velocidade.** "Rodou" não é "pronto".
2. **Segurança e LGPD desde a fundação**, nunca como fase final.
3. **Estados explícitos** — nenhum status muda fora da máquina de estados documentada (§7).
4. **Toda automação é idempotente.** 💡 *Idempotente = pode executar duas vezes sem efeito duplicado.
   Mensagem em dobro para cliente é falha crítica.*
5. **Software determinístico para o determinístico; IA só para o cognitivo.** Deduplicação, sincronização,
   cálculo e validação nunca usam IA. 💡 *Determinístico = sempre dá o mesmo resultado para a mesma entrada.*
6. **IA centralizada** — só o módulo `ai/` fala com a OpenAI. Custo, prompt e resposta auditáveis.
7. **Quality gates antes de qualquer disparo externo.** 💡 *Gate = portão de validação que bloqueia
   a etapa seguinte se algo estiver errado.*
8. **Falha silenciosa é proibida** — tudo que falha aparece em painel.
9. **Contratos em toda fronteira** — validação de dados (Zod) em cada entrada e saída externa.
10. **Clean Architecture com ênfase em módulos** (§5.3): dependências apontam para dentro,
    e cada módulo é dono do seu domínio, dos seus casos de uso e dos seus CRUDs.
11. **Sigilo entre marcas atravessa todas as camadas** — do template ao remetente.

---

## 5. Arquitetura

### 5.1 Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Framework | **Next.js (App Router) + React + TypeScript strict** | padrão validado nos 3 projetos anteriores (Viratour, Bellasu, ChronosLab) |
| UI | **Tailwind v4 + shadcn/Radix + Design System "Sinal Duplo"** (§14) | tokens únicos, mesma governança do Viratour |
| Motion | **Framer Motion (motion)** + View Transitions | §14.5 |
| Banco | **Supabase (PostgreSQL) + Drizzle ORM** | RLS nativo, migrations versionadas, types gerados |
| Auth | **Supabase Auth** + perfis `admin/gestor/vendedor` | cliente controla os próprios usuários |
| Jobs/Filas | **Inngest** (funções duráveis, cron, retry, chave de idempotência) | serverless-friendly; validado no Viratour |
| Cache/Rate limit | **Upstash Redis** | validado no Viratour |
| WhatsApp | **Z-API** atrás da interface `MessagingProvider` | experiência real; Meta Cloud API como plano B plugável |
| Marketplaces | APIs oficiais (**Mercado Livre, Shopee, TikTok Shop, Olist** — lista fechada) atrás de `ChannelProvider` | Cláusula 10.2 permite trocar fornecedor |
| **IA** | **OpenAI** via `AiService` central — `gpt-4.1-mini` (triagem/estruturação) + `gpt-4.1` (insights executivos) + embeddings p/ busca semântica (P2) | decisão de stack do projeto; modelos em camadas por custo |
| Documentos | **@react-pdf/renderer** (PDF) + **docx** (Word) | exigência do Anexo I item 05 |
| E-mail/Agenda | Gmail API / Google Calendar API | Anexo I item 03 |
| Deploy | **Vercel (região gru1/São Paulo)** + Supabase gerenciado | mesma infra dos projetos em produção |
| Observabilidade | **Sentry** + logs estruturados + tabelas `job_runs`/`llm_runs` | §13 |
| Testes | **Vitest** (unidade/integração) + **Playwright** (E2E dos fluxos críticos) | validado em Bellasu/ChronosLab |

### 5.2 Diagrama de arquitetura (visão organizada por camadas)

💡 *Leia de cima para baixo: quem está fora, como entra, o que acontece dentro, onde os dados moram.*

```
════════════════════════ MUNDO EXTERNO ════════════════════════════════════════

  CANAIS DE VENDA                CANAIS DE CONVERSA            SERVIÇOS
  ┌──────────────────┐           ┌──────────────────┐          ┌──────────────┐
  │ Mercado Livre    │           │ WhatsApp (Z-API) │          │ Gmail        │
  │ Shopee           │           │ Instagram DM     │          │ G. Calendar  │
  │ TikTok Shop      │           │ Facebook Msg     │          │ Cobranças    │
  │ Olist            │           └──────────────────┘          │ OpenAI       │
  └──────────────────┘                                         └──────────────┘
        │  ▲                            │  ▲                        │  ▲
  pedidos│  │estoque              msgs  │  │respostas       chamadas│  │retornos
        ▼  │                            ▼  │                        ▼  │
════════╪══╪════════════════ PORTA DE ENTRADA (LEO) ═══╪══╪═════════╪══╪═══════
        │  │                                           │  │         │  │
  ┌─────┴──┴───────────────────────────────────────────┴──┴──┐  ┌───┴──┴─────┐
  │  /api/webhooks/*  — recebe, VERIFICA ASSINATURA, enfileira│  │ AiService  │
  │  /api/*           — rotas da aplicação (sessão + RLS)     │  │ (único que │
  └───────────────────────────┬───────────────────────────────┘  │ fala com a │
                              ▼                                  │  OpenAI)   │
════════════════ NÚCLEO — MÓDULOS DE DOMÍNIO ════════════════════╪════════════
                                                                 │
  ┌─ clientes ─┐ ┌─ estoque ─┐ ┌─ vendas ─┐ ┌─ inbox ─┐ ┌─ reguas ┐│┌─ scoring ┐
  │ ficha 360º │ │ saldos e  │ │ pedidos, │ │conversas│ │ gatilhos │││ fórmulas │
  │ identidade │ │ livro-    │ │ funil,   │ │mensagens│ │ + GATES  │◀┤ churn/   │
  │ consenti-  │ │ razão,    │ │ tarefas, │ │ por     │ │ opt-in → │││ encalhe  │
  │ mento, tags│ │ alertas   │ │ agenda   │ │ marca   │ │ envio    │││ (sem IA) │
  └─────┬──────┘ └────┬──────┘ └────┬─────┘ └───┬─────┘ └────┬─────┘│└────┬─────┘
        └─────────────┴─────────────┴───────────┴────────────┴──────┴─────┘
                              │  eventos de domínio (§8)
                              ▼
════════════════ MOTOR DE AUTOMAÇÃO E DADOS ═══════════════════════════════════

  ┌───────────────────────────┐      ┌────────────────────────────────────────┐
  │  Inngest (fila de jobs)   │      │  PostgreSQL (Supabase) — RLS em tudo   │
  │  retry · backoff ·        │─────▶│  + Redis (cache/limites)               │
  │  idempotência · crons     │      │  + Storage (mídia/documentos)          │
  └───────────────────────────┘      │  + audit_log · job_runs · llm_runs    │
                                     └────────────────────────────────────────┘
════════════════ QUEM USA ═════════════════════════════════════════════════════

  Equipe Plast Leo (admin · gestor · vendedor) — web responsivo + PWA
  em celular, tablet, notebook e desktop (grade da §2.2)
```

### 5.3 Clean Architecture com ênfase em módulos

💡 *Clean Architecture = organizar o código em anéis: as regras de negócio ficam no centro e não
conhecem banco, tela ou API. A tela chama o caso de uso; o caso de uso usa a regra; o banco é
detalhe trocável. "CRUD" = as quatro operações básicas: Criar, Ler (Read), Atualizar (Update) e Deletar.*

A ênfase é **modular**: o anel não é global — **cada módulo tem os próprios anéis**. Um módulo é
uma mini-aplicação com domínio, casos de uso, infraestrutura e UI próprios:

```
src/
  app/                          # rotas Next.js — só "cola": chama casos de uso
  modules/
    <modulo>/                   # ex.: clientes, estoque, vendas, inbox, reguas...
      domain/                   # ① CENTRO — entidades, regras puras, máquinas
      │                         #    de estado, invariantes. Zero dependências.
      application/              # ② CASOS DE USO — CRUD padronizado + operações
      │                         #    (ex.: registrarPedido, dispararRegua) e
      │                         #    "portas" (interfaces do que precisam fora)
      infrastructure/           # ③ DETALHES — repositórios Drizzle, providers
      │                         #    externos, implementações das portas
      ui/                       # ④ TELAS — componentes/telas do módulo,
                                #    consumindo apenas application/
  shared/
    design-system/              # tokens, primitivas, motion (§14)
    events/                     # barramento de eventos de domínio (§8)
    lib/                        # supabase clients, zod helpers, utils
```

**Regra de dependência:** `ui → application → domain`. `infrastructure` implementa as portas de
`application`. Nenhuma camada interna importa a externa. Nenhum módulo importa `infrastructure`
de outro módulo — a comunicação entre módulos é por **serviços de aplicação tipados** ou **eventos**.

**CRUD como fábrica, não como repetição:** todo agregado ganha o pacote padrão
`create/getById/list(+filtros/paginação)/update/softDelete` gerado sobre um template único que já
embute validação Zod, checagem de perfil, escopo `org_id`/RLS, evento de domínio e auditoria.
💡 *Resultado: criar um novo cadastro no sistema custa horas, não dias — e nasce seguro e auditado.*

**Módulos do LEO:** `clientes`, `estoque`, `canais` (conectores), `inbox`, `vendas`, `reguas`,
`scoring`, `ai`, `documentos`, `relatorios`, `importacao`, `auditoria`, `jobs`, `observability`.

**Fronteiras explícitas (o que cada um NÃO faz):** `canais/` não decide regra de negócio; `reguas/`
não envia nada sem passar pelos gates; `ai/` não altera status, preço ou estoque; `scoring/` não
chama IA (fórmulas auditáveis); `documentos/` não decide quando gerar; `inbox/` não conhece o
provider concreto (só a porta `MessagingProvider`).

---

## 6. Modelo de Domínio

### 6.1 Dimensões estruturais
- **`org`** — grupo administrativo atual (fixo hoje). Toda tabela de dado do cliente tem `org_id` + RLS.
- **`brand`** — KARZI, WUWU e Armarinhos Lima. Produtos, canais, templates,
  campanhas e identidades de remetente são **por marca**. O **cliente é da org** — a relação
  cliente↔marca é derivada de pedidos e conversas. 💡 *O mesmo comprador em mais de uma operação é
  1 cadastro com um insight valioso — mas ele nunca saberá disso por fora (Invariante nº 1).*
- **`channel_account`** — cada conta conectada (ML-KARZI, Shopee-WUWU, WhatsApp-KARZI…) com
  `brand_id`, tipo, credencial (referência ao vault — nunca token em texto claro), status e saúde.

### 6.2 Entidades principais

```
org · brand · channel_account · app_user (admin|gestor|vendedor)

cliente                # unificado por org (dedupe por telefone E.164 / e-mail / CPF-CNPJ)
cliente_identidade     # identidades por canal (buyer ML, tel WhatsApp, IG handle) → 1 cliente
consentimento          # base legal por finalidade+canal+marca: opt-in, origem, prova, revogação
interacao              # timeline unificada: mensagem, pedido, ligação, nota, tarefa, e-mail
tag · cliente_tag · segmento   # grupos por interesse, origem, comportamento, estágio

produto                # por brand; SKU, custo, preço, estoque mínimo
produto_canal          # mapeamento SKU ↔ anúncio por channel_account
estoque_saldo          # saldo único por SKU (fonte da verdade)
estoque_movimento      # entrada|saida|ajuste|reserva — livro-razão imutável
                       # 💡 livro-razão: como extrato bancário — o saldo nunca é editado,
                       #    só nasce da soma dos movimentos. Auditável por natureza.

pedido · pedido_item   # venda normalizada de qualquer canal (brand, canal, valores, status)
funil_etapa · oportunidade · tarefa · evento_agenda

conversa · mensagem    # inbox unificado; direção, tipo, provider_message_id (idempotência)

regua                  # gatilho → condições → gates → template → canal (por marca)
regua_execucao         # cada disparo: gates avaliados, status, idempotency_key
template_mensagem      # texto do cliente, por marca e canal (jamais compartilhado entre marcas)

score_cliente          # churn_risk, RFM, próxima_compra_estimada (+ explicação)
score_produto          # risco de encalhe, giro, capital parado
insight                # leitura da IA c/ números-fonte, confiança e validade
sugestao_campanha      # quem/quando/oferta/desconto mínimo → sugerida|aprovada|rejeitada
documento_gerado       # propostas/minutas DOCX/PDF + dados de origem

evento_dominio · audit_log (insert-only) · job_run · llm_run
import_lote · import_registro  # migração com relatório de aceitos/rejeitados por linha
```

### 6.3 Regras de modelagem
- `uuid` como PK; `timestamptz` sempre; `numeric` para dinheiro; soft delete só em `cliente` e `produto`.
- Idempotência por chave natural única: `provider_message_id`, `provider_order_id`,
  `regua_execucao.idempotency_key` = `{regua_id}:{cliente_id}:{gatilho}:{data}`.
- RLS por `org_id` + política por perfil (vendedor não vê custo/margem; gestor não administra usuários).
- **Disciplina de banco** (do estudo de Supabase/Postgres): índice em todo campo de filtro, junção e
  ordenação (`cliente_id`, `brand_id`, `status`, `criado_em`…) + índice GIN para busca textual de
  clientes/produtos; trigger `set_updated_at` em toda tabela mutável; `constraint check` para todo
  status (a regra vive no banco, não só no código); funções com `security invoker` por padrão
  (`security definer` só com `search_path` fixado e justificativa em ADR).
- **Types gerados**: `supabase gen types` a cada migration — o TypeScript conhece o schema real,
  divergência quebra o build (erro aparece no CI, não em produção).
- **Seed sintético**: dados fictícios realistas para dev/staging — dado real de cliente nunca sai
  de produção (mesmo princípio synthetic-data-first do material de engenharia).

---

## 7. Máquinas de Estado

💡 *Máquina de estados = mapa oficial dos status possíveis e das transições permitidas. Qualquer
mudança fora das setas é rejeitada pelo sistema (e testada).*

**Pedido (normalizado entre canais)**
```
criado → pago → separado → enviado → entregue → avaliacao_solicitada → concluido
   └──▶ cancelado (antes de enviado; com motivo)        entregue ─▶ devolvido
```
`pago` baixa estoque (movimento `saida`); cancelamento antes do envio estorna (`entrada`);
`entregue` é o único gatilho válido da régua de avaliação.

**Conversa (inbox)**
```
nova → em_atendimento ⇄ aguardando_cliente → resolvida → (reabre se cliente responde)
                              └──▶ arquivada
```

**Execução de régua**
```
elegivel → gates_aprovados → agendada → enviada → confirmada
   │            │                          └─▶ falhou (retry ×3 c/ backoff) → falha_definitiva
   └─▶ bloqueada(motivo_gate)
```
`bloqueada` registra **qual gate** barrou — vira relatório de conformidade automático.

**Sugestão de campanha (IA)**
```
sugerida → aprovada(humano) → régua/segmento criado → medida
    └────▶ rejeitada(motivo)     (expira em 14 dias sem ação)
```

**Conector de canal**
```
conectado ⇄ degradado (falhas intermitentes) → desconectado (credencial inválida) → conectado
```
Estado sempre visível no painel; `desconectado` alerta o admin na hora.

---

## 8. Sistema de Eventos

💡 *Evento de domínio = aviso interno de "algo aconteceu" (ex.: pedido pago). Os módulos reagem a
eventos em vez de se chamarem diretamente — isso desacopla e deixa tudo rastreável.*

```
cliente.criado · cliente.mesclado · cliente.consentimento_registrado · cliente.consentimento_revogado
pedido.recebido · pedido.pago · pedido.enviado · pedido.entregue · pedido.cancelado · pedido.devolvido
estoque.baixa_automatica · estoque.minimo_atingido · estoque.parado_detectado · estoque.divergencia_detectada
conversa.recebida · conversa.sem_resposta_24h · mensagem.falhou
regua.disparada · regua.bloqueada · regua.falha_definitiva
score.churn_alterado · score.encalhe_alterado
ia.insight_gerado · ia.sugestao_criada · ia.sugestao_aprovada · ia.sugestao_rejeitada · ia.limite_consumo_atingido
documento.gerado · canal.conectado · canal.degradado · canal.desconectado
importacao.concluida · importacao.com_erros · backup.executado · backup.falhou
```

Todo evento carrega `event_id`, `org_id`, `brand_id?`, entidade de origem, `causation_id`
(webhook/job/ação que causou) e payload validado. Consumidores (Inngest) são idempotentes.
Tudo alimenta a `audit_log`.

---

## 9. Módulos Funcionais

### M0 — Fluxo de vida canônico (a espinha dorsal)

💡 *Antes dos módulos, o filme completo: esta é a sequência oficial que todo pedido percorre.
Qualquer funcionalidade nova precisa apontar para um passo desta lista — se não aponta, é sinal
de escopo estranho. (Padrão de "lifecycle canônico" da metodologia estudada.)*

```
 0. Gestor configura canais, réguas, templates e limiares (por marca)
 1. Pedido nasce em um canal (ML, Shopee, TikTok, Olist, loja, manual)
 2. Sistema ingere, normaliza e deduplica o pedido            → A1
 3. Cliente é resolvido/criado no motor de identidade (1 ficha p/ org)
 4. Pagamento confirmado → baixa no livro-razão de estoque    → A2
 5. Saldo novo é sincronizado para os demais canais           → A4
 6. Timeline do cliente e métricas do painel atualizam
 7. Entrega confirmada → régua de avaliação passa pelos 6 gates → A8
 8. Scores noturnos recalculam churn/recompra/encalhe         → A13–A14
 9. IA gera insights e sugestões de campanha                  → A15–A16
10. Gestor aprova/rejeita sugestões (1 gesto)
11. Campanha aprovada dispara pelas réguas (gates de novo)
12. Resultado (resposta, recompra) volta para a timeline e os scores
13. Toda mudança de estado emite evento + auditoria (§8)
```

Caminho alternativo: cliente esfriando (passo 8) → régua de reativação (A10) → recompra volta ao
passo 1. É um ciclo: **o sistema aprende do próprio resultado.**

### M1 — Clientes 360º (P0)
- Ficha única com **timeline unificada** (mensagens, pedidos, e-mails, notas, tarefas — todos os
  canais, em ordem cronológica), com o chip da marca em cada interação.
- **Motor de identidade**: deduplicação determinística (telefone E.164, e-mail, CPF/CNPJ) + fila
  de "possíveis duplicados" para mesclagem manual. 💡 *O sistema junta sozinho só o que é certeza
  matemática; casos parecidos vão para decisão humana — nunca mescla no chute.*
- Tags, segmentos salvos, tarefas, lembretes e agenda comercial com notificações.
- Perfis: vendedor vê carteira e atendimento; custo/margem só gestor+.

### M2 — Estoque sincronizado (P0)
- Saldo único por SKU (fonte da verdade) espelhado nos canais via `produto_canal`.
- **Baixa automática** no `pedido.pago` de qualquer canal; estorno em cancelamento.
- Sincronização de saldo para os canais com fila + retry; **reconciliação noturna** compara saldo
  local × canal e **alerta divergência sem corrigir sozinho**.
- Alertas: mínimo atingido (limiar por SKU) e estoque parado (sem venda há N dias + capital preso em R$).

### M3 — Conectores (P0, ativação faseada)

Interfaces (portas) por tipo — implementações trocáveis sem tocar no domínio:
```
ChannelProvider    → buscarPedidos, sincronizarEstoque, pedirAvaliacao?, saude()
MessagingProvider  → enviarMensagem, receberWebhook, midia, saude()
BillingProvider    → criarCobranca, webhookStatus
MailProvider       → enviar, sincronizarAgenda
```

**Canais de venda — lista fechada (definida em 17/07/2026):** Mercado Livre, Shopee, TikTok Shop
e Olist. Loja online própria (Nuvemshop/Shopify/Tray) **não** está contratada — se surgir depois,
entra como Evolução (Cláusula 4.3).

| Conector | Tipo | Nota |
|---|---|---|
| Mercado Livre | Channel + avaliação | OAuth; mensagens pós-venda só pelo canal oficial |
| Shopee | Channel | API oficial |
| TikTok Shop | Channel | API oficial |
| Olist | Channel (hub — Amazon e outros via Olist) | API oficial |
| WhatsApp (Z-API) | Messaging | 1 instância por marca (sigilo entre marcas) |
| Instagram/Facebook | Messaging | Meta Graph; DMs no inbox, por conta de marca |
| Cobranças | Billing | gateway definido na Fase 1 (Asaas já dominado) |
| Gmail + Calendar | Mail | e-mail na timeline; agenda comercial |

Regras: credenciais no vault; `saude()` de cada conector no painel; falha de terceiro degrada com
aviso, nunca derruba o resto; conector fora da lista fechada da Fase 1 = Evolução.

### M4 — Réguas de relacionamento (P0)

💡 *Régua = sequência automática de mensagens disparada por um gatilho (ex.: "3 dias após a
entrega, pedir avaliação"). O termo vem de "régua de relacionamento" do marketing.*

Contratadas: **avaliação pós-entrega** (Google + marketplace, pelo canal oficial de cada um),
**aniversário** (com oferta definida pelo cliente) e **reativação** (sem compra há N dias).
Estrutura genérica `gatilho → condições → gates → template → canal` (futuras réguas = Evolução).

**Pipeline de disparo com quality gates (inegociável):**
```
Gatilho (evento/cron)
 → Gate 1  Opt-in registrado para finalidade + canal + marca?
 → Gate 2  Canal permitido para a origem? (cliente de marketplace NÃO sai do canal dele)
 → Gate 3  Sigilo de marca ok? (template, remetente e links são da marca do pedido)
 → Gate 4  Não duplicado? (idempotency_key + cooldown por régua)
 → Gate 5  Janela de horário comercial + limite diário por cliente
 → Gate 6  Template aprovado existe?
 → Enviar → registrar → medir
```
Cada bloqueio grava o motivo. Opt-out em toda mensagem; revogação cancela execuções agendadas em minutos.

### M5 — Inteligência (P0/P1) → detalhada na §11

### M6 — Painel e relatórios (P0)
- **Painel executivo**: vendas, conversão e ticket por canal/marca/vendedor em tempo quase-real;
  alertas de estoque; execuções e bloqueios de réguas; saúde dos conectores; consumo de IA.
- **Relatórios exportáveis** PDF/XLSX com filtros por período, canal, marca e vendedor.
- **Trilha de auditoria navegável** (quem fez o quê, quando, origem: manual/job/IA/webhook).
- Busca global (Ctrl+K / botão de busca no mobile).

### M7 — LGPD e importação (P0) → segurança completa na §12
- Consentimento como entidade (finalidade × canal × marca × origem × prova), gate de toda régua,
  revogável por opt-out.
- Retenção e anonimização configuráveis (ex.: anonimizar inativos após N anos).
- **Importação/migração**: pipeline `arquivo → interpretação (planilha/XML/CSV; PDF/DOCS com
  extração assistida) → validação → prévia → confirmação`, com relatório de aceitos/rejeitados
  por linha e motivo. 💡 *A prévia mostra o que vai entrar antes de entrar — migração sem susto.*

---

## 10. Catálogo de Automações

Visão consolidada de **tudo que o sistema faz sozinho** — cada linha é um job Inngest idempotente,
com retry, log e visibilidade no painel:

| # | Automação | Disparo | O que faz | Módulo |
|---|---|---|---|---|
| A1 | Ingestão de pedidos | webhook/poll por canal | normaliza, deduplica, vincula cliente, persiste | canais |
| A2 | Baixa de estoque | `pedido.pago` | movimento `saida` no livro-razão | estoque |
| A3 | Estorno de estoque | `pedido.cancelado` (pré-envio) | movimento `entrada` | estoque |
| A4 | Sync de saldo | mudança de saldo | empurra saldo novo aos canais conectados | estoque/canais |
| A5 | Reconciliação de saldo | cron noturno | compara local × canal, alerta divergência | estoque |
| A6 | Alerta de mínimo | saldo ≤ limiar | notifica gestor + destaca no painel | estoque |
| A7 | Detecção de encalhe | cron noturno | sem venda há N dias + capital parado | scoring |
| A8 | Régua: avaliação | `pedido.entregue` | convite de avaliação pelo canal oficial (gates) | reguas |
| A9 | Régua: aniversário | cron diário 9h | mensagem + oferta (gates) | reguas |
| A10 | Régua: reativação | cron diário | sem compra há N dias → campanha (gates) | reguas |
| A11 | Cancelamento por opt-out | `consentimento_revogado` | cancela execuções agendadas do cliente | reguas |
| A12 | Aviso de conversa parada | sem resposta da equipe > X h | tarefa/alerta interno ao responsável (não fala com o cliente — isso seria Domina) | inbox |
| A13 | Scores de cliente | cron noturno | churn/recompra (RFM) com explicação | scoring |
| A14 | Scores de produto | cron noturno | risco de encalhe + ação sugerida | scoring |
| A15 | Insights executivos | cron semanal | leitura do funil em linguagem simples (IA) | ai |
| A16 | Sugestões de campanha | cron semanal | quem/quando/oferta → fila de aprovação | ai |
| A17 | Documentos automáticos | ação do usuário | proposta/minuta DOCX/PDF preenchida | documentos |
| A18 | Saúde dos conectores | cron 15 min | `saude()` por conta; alerta se degradar | canais |
| A19 | Notificações internas | eventos vários | tarefas vencendo, aniversariantes do dia, contas a vencer | vendas |
| A20 | Backup + verificação | cron diário | backup e checagem de integridade | observability |
| A21 | Guarda de consumo IA | contínuo | alerta 70%/90% do orçamento; corte suave (§11) | ai |
| A22 | Limpeza/retenção LGPD | cron mensal | aplica políticas de retenção/anonimização | clientes |

💡 *"Cron" = agendador de tarefas por horário (ex.: toda noite às 3h). "Retry com backoff" =
tenta de novo esperando cada vez mais entre tentativas.*

**Fila de cartas mortas (dead-letter):** job que esgota as tentativas não some — cai numa fila de
falhas definitivas visível no painel `/admin/saude`, com payload, erro e botão de reprocessar.
💡 *Nada "morre em silêncio": toda automação que desistiu fica exposta esperando decisão humana.*

---

## 11. Camada de Inteligência (OpenAI)

Arquitetura em **duas camadas** — números auditáveis primeiro, linguagem depois:

### Camada A — Scoring determinístico (`scoring/`, P0) — sem IA
- **Churn/recompra**: RFM (recência, frequência, valor) + intervalo médio de compra do próprio
  cliente → `churn_risk` 0–100 + `próxima_compra_estimada`, sempre com explicação legível
  ("3 compras/ano, última há 97 dias, intervalo médio 45 dias").
  💡 *RFM = método clássico e auditável de classificar clientes por comportamento de compra.*
- **Encalhe**: giro por SKU × tendência × capital parado → `risco_encalhe` 0–100 + ação sugerida
  (promoção, kit, remarcação).
- **Desconto mínimo**: margem do SKU + histórico de conversão por faixa de desconto → piso
  sugerido, nunca abaixo da margem mínima configurada pelo gestor.
- Fórmulas **versionadas** — o painel mostra qual versão calculou cada número.

### Camada B — IA generativa (OpenAI via `AiService`, P0/P1)
- **Insights do funil** (P1, calibração na Fase 4): motivos de perda, gargalos e desempenho por
  canal, em linguagem simples, gerados **a partir de agregados** — cada afirmação cita os números-fonte,
  carrega selo de confiança e data de validade.
- **Sugestões de campanha** (P0): combina scores + segmentos e redige quem/quando/oferta/desconto
  mínimo → **sempre para aprovação humana**.
- **Documentos automáticos** (P0): propostas e minutas DOCX/PDF — merge determinístico de campos
  no template do cliente; IA apenas nos trechos redacionais marcados.

### Guardrails do módulo `ai/`
💡 *Guardrail = trilho de proteção: limites técnicos que impedem a IA de sair da pista.*
1. Saída estruturada validada (Zod) com 1 tentativa de reparo → falhou, vai para revisão; nunca propaga.
2. **Mínimo de dado pessoal no prompt** — agregados e IDs, nunca listas completas de clientes.
3. `llm_run` para toda chamada: modelo, tokens, custo, duração, finalidade → painel de consumo
   com orçamento-alvo, alertas em 70%/90% e **corte suave** (insights pausam; a operação nunca para).
4. Modelos em camadas: `gpt-4.1-mini` para classificação/estruturação; `gpt-4.1` só para insight executivo.
5. Toda tela de IA carrega o aviso da Cláusula 11.3 (resultado probabilístico, decisão é do cliente).
6. IA **não** dispara mensagem, **não** altera preço/estoque, **não** decide sozinha — Invariante nº 4.

### Evals — medição contínua da qualidade da IA

💡 *Eval = avaliação sistemática. O gate decide "este resultado passa?"; o eval mede "a IA está
ajudando ou só gerando texto bonito?" ao longo do tempo. Sem eval, troca de prompt/modelo é aposta.*

| Recurso de IA | Métricas acompanhadas | Baseline |
|---|---|---|
| Sugestões de campanha | taxa de aprovação do gestor · taxa de conversão das campanhas aprovadas · custo por sugestão | campanhas manuais pré-CRM |
| Insights de funil | utilidade percebida (👍/👎 do gestor em cada insight) · % com números-fonte corretos | — |
| Documentos automáticos | % gerados sem retrabalho manual · tempo economizado | tempo de redação manual |
| Scores (Camada A) | correlação `churn_risk` alto × cliente que realmente sumiu · acerto da `próxima_compra_estimada` (±15 dias) | histórico importado |

Regras de regressão (da aula de Loops/Evals):
- **Goldenset**: conjunto fixo de ~20 casos reais aprovados + 20 rejeitados. 💡 *Amostra-gabarito:
  antes de trocar prompt ou modelo, roda-se contra ela — se errar o que antes acertava, não sobe.*
- Toda mudança de prompt/modelo é versionada (`llm_run.prompt_version`) e comparada com a versão anterior.
- Se a taxa de aprovação de sugestões cair por 2 semanas seguidas → revisão obrigatória de prompt e exemplos.
- Resultados dos evals aparecem no painel de consumo de IA — qualidade e custo lado a lado.

---

## 12. Segurança da Informação e Governança Operacional

Sim — esta seção segue o que o material de estudo (Notion) define: segurança desde o início,
invariantes primeiro, RLS no banco, validação em toda borda, jobs idempotentes, logs sem segredos,
IA com contexto mínimo. E vai além, cobrindo a **operação** (banco e hospedagem) para que decisões
possam ser tomadas sem sufoco.

### 12.1 Segurança da aplicação
| Controle | Implementação |
|---|---|
| Isolamento de dados | **RLS** em todas as tabelas (org + perfil); `service_role` só no servidor. 💡 *RLS = o próprio banco recusa linhas que o usuário não pode ver — mesmo que o código erre.* |
| Autenticação | Supabase Auth; senha forte obrigatória; sessão com expiração; **2FA para `admin`** (P1) |
| Autorização | checagem de perfil em **toda** rota e caso de uso (nunca só esconder botão) |
| Validação | Zod em toda borda (webhooks, formulários, importação); limite de tamanho de payload |
| Webhooks | verificação de assinatura de cada provedor; rejeição + log de tentativas inválidas |
| Rate limiting | Upstash nas rotas públicas, de auth e de disparo. 💡 *Limita tentativas por minuto — barra robôs e força bruta.* |
| Headers/CSP | headers de segurança + Content-Security-Policy no Next.js |
| Segredos | vault de credenciais de integração; **nada** de token em código, log ou repositório; rotação documentada |
| Auditoria | `audit_log` **insert-only** (ninguém edita/apaga o passado) |
| Uploads | validação de tipo/tamanho; URLs assinadas com expiração para arquivos privados |
| Dependências | atualizações de segurança na manutenção mensal; lockfile auditado |

### 12.2 LGPD (Cláusula 12)
- Papéis formais: Plast Leo **controladora**, contratada **operadora**.
- Consentimento por finalidade × canal × marca, com prova e revogação (gate de toda régua).
- Direitos do titular operacionalizados: exportar dados de um cliente, anonimizar, excluir — botões
  no admin, com trilha.
- Minimização: IA e logs recebem o mínimo necessário; relatórios agregados por padrão.
- Incidente relevante: comunicação sem demora + plano da §12.4.

### 12.3 Governança de banco e hospedagem (decisão sem dependência)
💡 *Objetivo: você (e o cliente, na saída) nunca ficarem reféns de infraestrutura. Tudo tem
procedimento escrito, testado e reversível.*

| Tema | Padrão operacional |
|---|---|
| Ambientes | **3 ambientes**: `dev` (local) → `staging` (homologação, dados sintéticos) → `prod`. Nada entra em prod sem passar por staging. |
| Migrations | SQL versionado no repo (fonte da verdade do schema); aplicação via CI; **toda migration tem plano de rollback** anotado. 💡 *Migration = mudança de estrutura do banco registrada em arquivo, como um histórico do banco.* |
| Backups | diário automático (Supabase) + exportação lógica semanal guardada fora do provedor. **RPO 24h / RTO 4h** — 💡 *RPO = máximo de dados que se aceita perder (1 dia); RTO = tempo máximo para voltar ao ar (4h).* |
| Teste de restauração | **mensal**, em staging, com checklist no RUNBOOK — backup que nunca foi restaurado não é backup. |
| Deploys | Vercel com preview por PR; produção só via branch `main`; rollback em 1 clique para o deploy anterior. |
| Independência de fornecedor | Postgres padrão + Drizzle + interfaces de provider = migrar de Supabase/Vercel é procedimento documentado no RUNBOOK, não um projeto de pesquisa. |
| Painel de saúde | página interna `/admin/saude`: status dos conectores, fila de jobs, últimas falhas, data do último backup e do último teste de restauração, consumo de IA — **decisão informada em uma tela**. |
| Acessos | princípio do menor privilégio: chaves separadas por ambiente; ninguém desenvolve apontando para prod. |
| Custos | painel de consumo por recurso (§13) + alertas — sem surpresa de fatura. |
| Rotina de operação | **diária** (5 min): painel de saúde — falhas de jobs, conectores, mensagens não entregues. **Semanal** (30 min): divergências de estoque, bloqueios de régua, evals de IA, custo acumulado. **Mensal**: teste de restauração + revisão de acessos. Roteiro passo a passo no RUNBOOK. |

### 12.4 Plano de resposta a incidentes (RUNBOOK)
1. **Detectar** (Sentry/painel/alerta) → 2. **Classificar** (crítico: vazamento, perda de dado,
sistema fora / alto: canal caído, régua falhando / médio) → 3. **Conter** (pausar réguas: 1 botão;
revogar credencial: procedimento por conector; restaurar backup: passo a passo) → 4. **Comunicar**
(cliente + titulares se LGPD exigir) → 5. **Post-mortem** registrado em `docs/DECISOES/` com prevenção.

---

## 13. Observabilidade e Custos de Ferramentas

💡 *Observabilidade = capacidade de enxergar o que o sistema fez e quanto custou, sem adivinhar.*

- Logs estruturados com `request_id`, `org_id`, `job_id`, `event_id` — nunca com segredo ou dado sensível.
- Sentry para exceções; painel interno de `job_runs` (fila, tentativas, falhas visíveis).
- Métricas de negócio como parte do produto: entregabilidade de mensagens, bloqueios por gate,
  divergências de estoque, disponibilidade por conector.

**Custos mensais estimados das ferramentas** (planos iniciais; monitorados no painel):

| Ferramenta | Papel | Estimativa/mês |
|---|---|---|
| Vercel | hospedagem do app | US$ 0–20 (Hobby→Pro conforme uso) |
| Supabase | banco + auth + storage | US$ 25 (Pro) |
| Upstash Redis | cache + rate limit | US$ 0–10 |
| Inngest | filas e crons | US$ 0–20 |
| Z-API | WhatsApp (até 3 instâncias, uma por operação) | ~R$ 200–600 |
| OpenAI | IA (orçamento-alvo com corte suave) | ≤ US$ 20 |
| Sentry | erros | US$ 0 (free) |
| **Total aproximado** | | **~R$ 450–750/mês** conforme volume |

Consumo fora da curva vira dado objetivo para a revisão extraordinária prevista em contrato (Cláusula 6.5).

---

## 14. Design System — "Sinal Duplo"

### 14.1 Conceito
As três logos dão o DNA: o **velocímetro KARZI** (vermelho/amarelo), o **neon WUWU**
(roxo/preto) e o wordmark **Armarinhos Lima** (cinza/vermelho). O produto LEO não copia
nenhuma delas: ele é o **painel de controle neutro e premium** onde as três operações acendem
como *sinais*. Daí o nome: **Sinal Duplo**.

**Assinatura visual do produto:** o gradiente `Vermelho KARZI → Roxo WUWU → Cinza Armarinhos Lima` — usado com parcimônia
(hero do login, barra de progresso global, realce do onboarding, ring de foco de elementos de
destaque). Ele conta a história do produto: três operações, uma central.

### 14.2 Paleta (tokens)

**Neutros (estrutura) — tema claro "Vitrine" / tema escuro "Cabine"**

| Papel | Claro | Escuro |
|---|---|---|
| Fundo | `#F7F7F8` (porcelana) | `#0E0F13` (grafite profundo) |
| Superfície/card | `#FFFFFF` | `#16181E` |
| Superfície elevada | `#FFFFFF` + sombra e2 | `#1C1F27` |
| Borda | `#E6E7EA` | `#262A33` |
| Texto primário | `#15171C` | `#F2F3F5` |
| Texto secundário | `#5A5F6A` | `#9AA0AC` |

**Cores de marca (identificação de contexto — nunca tema global)**

| Token | Valor | Uso |
|---|---|---|
| `--karzi` | `#E3131B` | chip, avatar de marca, filtros e gráficos da KARZI |
| `--karzi-accent` | `#FFC400` | detalhe secundário KARZI (o "ponteiro" do velocímetro) |
| `--wuwu` | `#9B30D9` | chip, avatar de marca, filtros e gráficos da WUWU |
| `--gradient-signature` | `linear-gradient(135°, #E3131B 0%, #9B30D9 100%)` | assinatura do produto (uso restrito) |

**Semânticas (estado do dado — separadas das cores de marca de propósito)**

| Papel | Valor | Nota |
|---|---|---|
| Sucesso / recebido | `#1F8A4C` | verde — não existe nas logos, por isso lê-se como *estado*, nunca como *marca* |
| Atenção / pendente | `#B57A00` | âmbar queimado (derivado do amarelo KARZI, escurecido p/ contraste AA) |
| Erro / vencido | `#C21820` | vermelho semântico ≠ vermelho KARZI (`#E3131B`) por 1 tom — gráficos nunca confundem "erro" com "KARZI" |
| Informação | `#2563EB` | azul neutro |

Regra de leitura: **cor de marca identifica "de quem é o dado"; cor semântica identifica "como o
dado está"**. As duas convivem no mesmo card sem ambiguidade (chip de marca + status).
Chips/ícones usam a fórmula `fundo 10% + texto 100%` do tom (padrão Viratour).

### 14.3 Tipografia e forma
- **Sora** (títulos e métricas — geométrica, combina com as duas logos), **Inter** (corpo e UI).
- Escala: título de página 24px · hero 28px · seção 15px/700 · métrica 22px tabular · corpo 14px · legenda 12px.
- Radius: cards 1.25rem, botões 0.75rem, chips pílula; ícone-badge **squircle** 40px (nunca círculo perfeito).
- Sombras: e1 repouso `0 4px 20px rgba(14,15,19,.06)` · e2 hover · e3 flutuante.
- Ícones: Lucide, 18–20px, stroke 1.75.

### 14.4 UX — padrões de experiência
- **Balões em três papéis** (pedido explícito do produto):
  1. **Balões de conversa** no inbox — estilo mensageiro (entrada à esquerda, saída à direita,
     rabinho, hora, status ✓/✓✓, agrupamento por minuto), com o tom da marca da conversa na
     borda do cabeçalho.
  2. **Balões de dica (tooltips e coach marks)** — todo termo técnico da UI tem um `?` com
     explicação em linguagem simples (o mesmo espírito dos 💡 deste documento); primeira visita
     a cada tela ganha um tour curto de 3 passos, dispensável e reexibível.
  3. **Balões de notificação** — toasts com ação de desfazer (padrão para toda operação
     reversível) e badges de contagem no menu (não-lidas, aprovações pendentes).
- **Empty states ilustrados**: cada tela vazia tem ilustração própria (estilo flat, traço fino,
  acento da marca em uso) + 1 frase + 1 ação. 💡 *Tela vazia é onboarding disfarçado.*
- **Estados obrigatórios** em toda tela: carregando (skeleton), vazio (ilustrado), erro (com
  retry), sem permissão (explicativo).
- **Formulários em wizard** para fluxos longos (pedido manual, campanha, importação) com
  progresso salvo por etapa — padrão validado no Viratour.
- **Aprovações em 1 gesto**: fila de sugestões da IA em cards com aprovar/rejeitar (swipe no
  mobile, teclas no desktop).
- **Atalhos**: Ctrl+K busca global; `g c` clientes, `g i` inbox, `g p` painel (desktop).
- **Acessibilidade**: contraste AA, foco visível, navegação por teclado no inbox,
  `prefers-reduced-motion` respeitado, zoom 200% sem quebra.

### 14.5 Motion (especificação)
💡 *Motion = a camada de movimento da interface. Bem feita, comunica hierarquia e resposta; mal
feita, vira enfeite lento. Regra: rápido, sutil, com propósito.*

| Elemento | Animação | Duração / easing |
|---|---|---|
| Entrada de página | fade-up 8px com stagger de 40ms entre cards | 240ms · `cubic-bezier(0.4,0,0.2,1)` |
| Hover de card interativo | lift −2px + borda no tom do contexto | 160ms |
| Balões do inbox | scale 0.96→1 + fade na chegada; ✓✓ com micro-pulso | 180ms |
| Métricas do painel | contagem animada (number-flow) na primeira carga | 600ms |
| Gráficos | desenho progressivo do traço na entrada | 500ms |
| Aprovação de sugestão | card desliza para fora + toast com desfazer | 220ms |
| Alerta crítico (estoque/canal) | shake curto 1× + badge pulsante até visualizar | 300ms |
| Navegação | View Transitions (crossfade leve entre rotas) | 200ms |
| Skeletons | shimmer sutil | loop 1.4s |
| Onboarding/go-live | assinatura: traço do gradiente Sinal Duplo percorre o header | 800ms, 1× |

Proibido: animação bloqueante, parallax pesado, animação em dado crítico (número não "dança"
depois de carregado). Tudo desligável via `prefers-reduced-motion`.

### 14.6 Governança do design
Tokens em `shared/design-system/tokens.ts` + primitivas (`PageHeader`, `StatCard`, `SectionCard`,
`EmptyState`, `IconBadge`, `BrandChip`, `ChatBubble`, `CoachMark`) documentadas em
`docs/DESIGN-SYSTEM.md` **antes** da fase de UI — nenhuma tela recria padrão na mão.

---

## 15. Plano de Implantação em 3 Fases (Claude Code)

> **Execução autorizada em 21/07/2026.** Este é o roteiro oficial de construção e saneamento do
> sistema. As 3 fases de implantação são a
> visão de *engenharia*; elas se encaixam nas 5 fases *contratuais* da §16.

### Fase A — Fundação e Núcleo (≈ semanas 1–3 · cobre Fases contratuais 1–2)
**Objetivo:** esqueleto sólido e CRM core navegável.
- Repositório `emanuelmaestre/CRM` + branches (`main` protegida, `dev`, `feature/*`) + CI
  (typecheck, lint, testes, migration check) + ambientes dev/staging.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`) — 💡 *padrão de
  mensagens de commit que transforma o histórico do Git na narrativa técnica do projeto; regra
  das aulas de GitHub: "se não está versionado, não existe".*
- Scaffold Next.js + estrutura modular da §5.3 + design system base (tokens, primitivas, temas).
- Banco: migrations iniciais, RLS, seeds sintéticos; auth + perfis.
- Fábrica de CRUDs + módulos `clientes`, `estoque` (livro-razão), `vendas` (funil, tarefas,
  agenda), `auditoria`; shell do painel; protótipo navegável para o aceite da Fase 1 contratual.
- **Portão de saída:** DoD verde em tudo; staging navegável nos 4 breakpoints de teste; RLS testada.

### Fase B — Operação Conectada (≈ semanas 4–5 · cobre Fase contratual 3)
**Objetivo:** o mundo externo entra e sai do sistema com segurança.
- Conectores da lista fechada (OAuth primeiro); ingestão de pedidos; inbox unificado com balões;
  baixa/sync/reconciliação de estoque; réguas com os 6 gates; importação com prévia; painel de saúde.
- **Portão de saída:** pedido real de cada canal aparece ≤ 5 min; baixa correta ponta a ponta;
  régua dispara E bloqueia certo nos testes; zero mensagens duplicadas em teste de estresse.

### Fase C — Inteligência e Lapidação (≈ semanas 6–8 · cobre Fases contratuais 4–5)
**Objetivo:** camada preditiva, relatórios e a experiência final.
- `scoring/` (fórmulas versionadas) + `ai/` OpenAI (sugestões com aprovação, insights, documentos
  DOCX/PDF) + painel de consumo com corte suave.
- Relatórios exportáveis; polimento de motion/ilustrações/coach marks; testes E2E dos fluxos
  críticos; migração final; treinamento (vídeo/PDF); RUNBOOK completo; go-live.
- **Portão de saída:** checklist de go-live 100%; scores conferidos contra histórico; 0 disparos
  sem aprovação; teste de restauração de backup executado.

Método de trabalho no Claude Code (das aulas): agente construtor e agente revisor separados;
`.ai/CONTEXTO.md` curto apontando para `docs/`; incrementos pequenos com DoD; nada entra na `main`
sem revisão.

---

## 16. Cronograma contratual (5 fases — Cláusula 3.1)

Cada fase termina com homologação navegável + checklist de aceite assinável (Cláusula 4.1/4.2).

| Fase | Semanas | Entregas | Aceite (resumo) |
|---|---|---|---|
| **1 · Entendimento** | 1 | levantamento de processos e contas reais por marca, fluxos, protótipo navegável, `docs/` inicial. Canais de venda **já fechados** (ML, Shopee, TikTok Shop, Olist — 17/07/2026); resta confirmar contas por marca, gateway de cobrança e nº de WhatsApp | cliente valida protótipo e mapa de contas **por escrito** |
| **2 · CRM Core (MVP)** | 2–3 | auth+perfis, clientes 360º, funil, tarefas/agenda, estoque manual com livro-razão, auditoria, shell do painel | equipe navega em homologação; CRUD+RLS testados |
| **3 · Integrações** | 4–5 | conectores, inbox, pedidos, baixa+sync de estoque, réguas com gates, importação | pedido real ≤5min; baixa correta; gates comprovados |
| **4 · Inteligência** | 6–7 | scores, sugestões com aprovação, insights, documentos, painel de consumo, **calibração assistida** | scores conferidos; 0 disparos sem aprovação |
| **5 · Homologação e Go-live** | 8 | testes com equipe, migração final, treinamento, runbook, publicação | checklist 100%; equipe treinada |

Dependências do cliente (registrar no kickoff): acessos das plataformas, dados de migração,
textos das réguas por marca, responsável por aprovações (Cláusula 3.3 protege o prazo).

O kickoff da Fase 1 segue o **roteiro de diagnóstico do Apêndice C** — ouvir → entender →
quantificar antes de configurar (método "Base para a Reunião" do material de estudo).

---

## 17. Documentação viva

```
docs/
  PRD.md                 # este documento
  ARQUITETURA.md         # decisões técnicas + diagramas
  STATE_MACHINES.md      # máquinas de estado expandidas
  EVENTOS.md             # vocabulário + payloads + consumidores
  API_CONTRACTS.md       # rotas, schemas, erros
  DESIGN-SYSTEM.md       # Sinal Duplo: tokens, primitivas, motion
  SEGURANCA.md           # controles, gates LGPD, vault, checklist
  PLANO-DE-TESTES.md     # matriz de testes por tipo (§18.1) e cobertura mínima
  RUNBOOK.md             # operação: deploy, backup/restore, incidentes, rotina diária/semanal,
                         # migração de fornecedor
  DECISOES/ADR-xxx.md    # decisões arquiteturais datadas
.ai/
  CONTEXTO.md            # roteador curto para agentes (aponta, não contém)
  PADROES-DE-CODIGO.md   # convenções do repo
  CHECKLIST-DE-REVISAO.md# roteiro do agente revisor
```

## 18. Plano de Testes e Critério de Pronto

### 18.1 Plano de Testes

💡 *Teste automatizado = código que verifica o código. Roda no CI a cada mudança: se algo quebrar,
o erro aparece antes de chegar em produção — não depois.*

| Tipo | O que cobre | Exemplos concretos no LEO |
|---|---|---|
| **Unitário** (Vitest) | regras puras do `domain/` | fórmulas de score; transições de estado; cálculo de desconto mínimo; normalização E.164 |
| **Integração** | caso de uso + banco | CRUD da fábrica; baixa de estoque no `pedido.pago`; estorno no cancelamento; dedupe de pedido |
| **Segurança** | o que NUNCA pode acontecer | vendedor não lê custo/margem (RLS); acesso cruzado de org falha; webhook sem assinatura é rejeitado; régua sem opt-in é bloqueada; **template da marca A nunca sai por canal da marca B** (Invariante nº 1) |
| **E2E** (Playwright) | fluxos de dinheiro e mensagem, ponta a ponta | pedido→baixa→sync; entrega→gates→avaliação; sugestão→aprovação→disparo; importação com prévia |
| **Regressão** | todo bug corrigido | regra da aula: 1) escrever o teste que reproduz o bug, 2) vê-lo falhar, 3) corrigir, 4) vê-lo passar — o bug nunca volta sem ser detectado |
| **Responsividade** | grade da §2.2 | screenshot-test das telas-chave em 360/768/1024/1920 px |
| **Evals de IA** | §11 | goldenset a cada mudança de prompt/modelo |

Cobertura mínima exigida: 100% dos invariantes (§19) com teste de segurança; 100% das transições
de estado; todos os fluxos E2E listados verdes antes de cada go-live de fase.

### 18.2 Critério de Pronto (Definition of Done)

- [x] documentado (docs atualizados no mesmo PR)
- [x] valida entrada (Zod) e trata erro com mensagem útil
- [x] respeita RLS, perfil de acesso e **sigilo entre marcas**
- [x] não gera estado inválido (máquina de estados respeitada)
- [x] ações externas idempotentes (chave única + teste)
- [x] emite evento de domínio + auditoria quando muda estado
- [x] logs estruturados; falha aparece no painel
- [x] teste (unidade p/ regra crítica; E2E p/ fluxo de dinheiro/mensagem)
- [x] UI com estados de loading/vazio/erro/sem-permissão
- [x] responsivo verificado em 360 / 768 / 1024 / 1920 px
- [x] motion conforme §14.5 e desligável por `prefers-reduced-motion`
- [x] revisado (agente revisor + humano); typecheck, lint, testes, RLS, seeds, build e staging
  autenticado verdes — aceite final registrado em 22/07/2026

Evidências executáveis e contagens do portão da Fase A: `docs/fase-a-dod.json`.

## 19. Invariantes não-negociáveis

O sistema NUNCA pode:
1. **Cruzar a identidade de KARZI, WUWU ou Armarinhos Lima diante do cliente final** — nenhuma
   mensagem, remetente, documento, link ou template usa dados de outra operação.
2. Enviar mensagem sem opt-in registrado para aquela finalidade, canal e marca.
3. Puxar cliente de marketplace para fora do canal de origem.
4. Deixar a IA disparar comunicação ou alterar preço/estoque sem aprovação humana.
5. Enviar a mesma mensagem duas vezes pelo mesmo gatilho (idempotência).
6. Vender/baixar estoque sem movimento no livro-razão.
7. Mudar estado fora da máquina documentada.
8. Falhar em silêncio (job, webhook, sync ou IA).
9. Logar/expor credencial, token ou dado pessoal desnecessário.
10. Exibir custo/margem a perfil vendedor, ou misturar dados de outra org.
11. Perder dado do cliente (backup testado + trilha + exportação sempre possíveis).

## 20. Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Aprovações/limites de APIs de marketplace | Alta | cronograma | lista fechada na Fase 1; conectores independentes; OAuth na semana 1; Cláusulas 3.3/10.3 |
| Qualidade dos dados de migração | Média | Fases 3/5 | pipeline com prévia + relatório de rejeição; migração incremental |
| Banimento/limite de WhatsApp | Média | réguas | gates + opt-in + janela + volume progressivo; Z-API atrás de interface (plano B: Meta Cloud API) |
| Vazamento de vínculo entre marcas | Baixa | reputação das marcas | Invariante nº 1 + Gate 3 + testes automatizados de template/remetente por marca |
| Custo de IA acima do previsto | Baixa | margem | `llm_runs` + orçamento + corte suave |
| Expectativa de "IA que vende sozinha" | Média | expectativa | este PRD + Cláusula 11.3 + rótulo "sugestão" nas telas; Domina como evolução futura |
| Scope creep ("só mais um canal…") | Alta | prazo | Cláusula 4.3 + lista fechada por escrito |

## 21. Métricas de sucesso (90 dias pós-go-live)

**Métrica North Star:** 💡 *a métrica única que resume se o produto cumpre a promessa — todas as
outras existem para explicá-la (conceito da aula de Operação/Fase 3).*

> **% da receita mensal influenciada pelo CRM** — soma das vendas que passaram por régua,
> sugestão aprovada, reativação ou follow-up registrado no sistema ÷ receita total das três operações.
> Meta: crescer mês a mês; o painel executivo a exibe no topo, por marca.

Métricas de suporte:
- 100% dos pedidos dos canais conectados entrando sem digitação manual.
- Divergência de saldo < 1% (0 vendas de item esgotado).
- ≥ 90% das entregas gerando convite de avaliação dentro das políticas.
- ≥ 30% das sugestões da IA aprovadas pelo gestor (utilidade real, não teatro).
- Tempo de primeira resposta no inbox medido e em queda.
- 0 incidentes LGPD; 0 mensagens sem opt-in; 0 vazamentos de vínculo entre marcas.
- 100% das telas aprovadas nos 4 breakpoints de teste.

## 22. Checklist de revisão final deste PRD

Revisão executada na emissão da v2.0 — tudo conferido:

- [x] Responsividade com dimensões por dispositivo (§2.2–2.3) e amarrada ao DoD
- [x] Valores do contrato removidos; custos de ferramentas mantidos (§13)
- [x] Segurança alinhada ao material de estudo + governança de banco/hospedagem, ambientes,
      backup/restore com RPO/RTO, incidentes e independência de fornecedor (§12)
- [x] Repositório GitHub registrado (capa)
- [x] Estrutura societária correta: mesmo CNPJ, fantasias segregadas → Invariante nº 1 + Gate 3
- [x] Stack de IA = OpenAI, com modelos em camadas e guardrails (§11)
- [x] Diagrama reorganizado em camadas legíveis (§5.2)
- [x] Estrutura modular revisada: Clean Architecture **dentro** de cada módulo + fábrica de CRUDs (§5.3)
- [x] Termos técnicos com balões 💡 de explicação ao longo do documento
- [x] Paleta "Sinal Duplo" derivada das logos, com separação marca × semântica (§14.2)
- [x] Front com efeito, animação, ilustração, motion, UI/UX e balões (3 papéis) especificados (§14.4–14.5)
- [x] Implantação em 3 fases no Claude Code documentada — **sem execução agora** (§15)
- [x] Automações consolidadas em catálogo único A1–A22, todas idempotentes e visíveis (§10)
- [x] Coerência cruzada: todo módulo (§9) tem eventos (§8), automações (§10), estados (§7),
      segurança (§12) e critério de aceite (§16) correspondentes

**Adições da v2.1 — segunda revisão do material de estudo:**

- [x] Fluxo de vida canônico numerado 0–13 ligando módulos e automações (§9·M0 — padrão CareLoop)
- [x] Plano de Testes formal com testes de segurança dos invariantes e regra de regressão
      bug→teste (§18.1 — aulas 09/05 e 06/07) + `PLANO-DE-TESTES.md` na documentação (§17)
- [x] Evals de IA com goldenset, baseline e versionamento de prompt (§11 — aula 06/07)
- [x] Métrica North Star: % da receita influenciada pelo CRM (§21 — aula Fase 3)
- [x] Rotina de operação diária/semanal/mensal na governança (§12.3 — aula Fase 3)
- [x] Fila de cartas mortas visível com reprocessamento (§10 — princípios CareLoop)
- [x] Disciplina de banco: índices, triggers, constraints, types gerados, seed sintético
      (§6.3 — estudo Supabase)
- [x] Conventional Commits + narrativa técnica no Git (§15 — aulas Fase 3.2/4.1)
- [x] Roteiro de diagnóstico do kickoff em 6 blocos (Apêndice C — "Base para a Reunião")

---

### Apêndice A — Glossário
**Régua**: sequência automática de mensagens por gatilho. **Gate**: portão de validação que
bloqueia disparo. **Livro-razão**: histórico imutável de movimentos (como extrato bancário).
**Idempotente**: executar 2× não duplica efeito. **RLS**: o banco filtra linhas por permissão.
**RFM**: recência/frequência/valor — classificação auditável de clientes. **Encalhe**: produto sem
giro. **Opt-in/Opt-out**: consentimento registrado / descadastro. **Breakpoint**: largura em que o
layout se reorganiza. **PWA**: site instalável como app. **RPO/RTO**: perda máxima de dados /
tempo máximo de recuperação. **Evolução**: mudança fora do escopo aprovado (Cláusula 4.3).

### Apêndice B — Referências
Contrato PLAST LEO (17/07/2026) + Anexo I · Proposta FUGAZI (modelo comercial) · Logos KARZI/WUWU/Armarinhos Lima ·
Padrões validados: Viratour (design system, réguas WhatsApp, Inngest, PWA), ChronosLab
(anti-over-engineering, Clean Architecture), Bellasu (stack UI) · Metodologia: material de estudo
(engenharia AI-native 09/05; pipelines 01/07; orquestração 02/07; agentes 04/07; memória 05/07;
loops/gates 06/07; arquitetura modular 07/07; diagnóstico comercial "Base para a Reunião";
lifecycle canônico e princípios de engenharia do caso CareLoop; fundamentos Supabase/Postgres).

### Apêndice C — Roteiro de diagnóstico do kickoff (Fase 1)

💡 *Regra do método: não configurar antes de nomear a dor. A reunião de kickoff colhe as respostas
que travam ou destravam o cronograma inteiro. Sair da reunião sem esses dados = Fase 1 incompleta.*

**1. Canais e contas (por marca)**
- Quais contas existem hoje para KARZI e para WUWU? (ML, Shopee, TikTok, Olist, loja, WhatsApp, IG/FB)
- Quem é o titular de cada conta? Quem tem a senha/acesso? Há verificação pendente em alguma?
- Qual número de WhatsApp atende cada marca? Já é WhatsApp Business?

**2. Volumes (dimensionam filas, limites e custos)**
- Pedidos/mês por canal e por marca? Pico sazonal?
- Mensagens/dia recebidas por canal? Quem responde hoje, e em quanto tempo?
- Quantos SKUs por marca? Quantos clientes na base atual?

**3. Processo atual (o que o sistema vai substituir)**
- Onde o estoque é controlado hoje? Com que frequência dá divergência?
- Como um pedido é processado do "caiu" ao "enviado"? Quem faz o quê?
- O que é copiado/colado manualmente todos os dias? (mapa do retrabalho)

**4. Dados para migração**
- Em que formato estão clientes, produtos e histórico? (planilha, sistema, XML, PDF)
- Qual a qualidade? Há duplicados conhecidos? Quem valida a prévia da importação?

**5. Réguas e comunicação**
- Quais textos a empresa quer para avaliação/aniversário/reativação (por marca)?
- Existe base de consentimento hoje? De onde vieram os contatos?
- Regras de tom por marca: como a KARZI fala? Como a WUWU fala?

**6. Metas e régua de sucesso (calibra a North Star)**
- O que seria um bom resultado em 30/60/90 dias? (mais recompra? menos divergência? resposta mais rápida?)
- Quantas vendas a mais por mês já fariam o projeto valer? (ancora o ROI)
- Quem aprova campanhas no dia a dia? Quem é o responsável do projeto (Cláusula 8.2)?

Saída obrigatória da reunião: **lista fechada de conectores**, responsável nomeado, acessos
solicitados com prazo, textos das réguas encomendados e metas registradas — tudo por escrito.
