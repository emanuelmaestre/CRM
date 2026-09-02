/**
 * O Encanador: confere a pipeline inteira sob demanda, canal → banco → tela,
 * num único diagnóstico. Não é um agente novo (A-alguma-coisa) nem roda em
 * produção — é o script que você chama quando quer saber "está tudo
 * escoando?" sem abrir seis telas e o painel do Inngest.
 *
 * O que ele confere, nesta ordem (cada elo da pipeline):
 *
 *  1. Registro no Inngest — todo job ativo com `cron`/`event` declarado em
 *     src/modules/jobs/A*.ts está de fato na lista `functions` de
 *     src/app/api/inngest/route.ts? Jobs deliberadamente suspensos aparecem
 *     como aviso, com o motivo, e não como falha operacional.
 *  2. job_run — para cada agente que loga aqui, bateu a cadência esperada
 *     (cron) nas últimas 48h? Alguma falha recente?
 *  3. Canais — contas conectadas, canal_verificacao (frescor por módulo:
 *     pedidos/catálogo) e maturidade dos tokens
 *  4. Pedido → item → produto — pedido sem item, item apontando pra produto
 *     inexistente, produto sem nenhum produto_canal
 *  5. Estoque por canal — saldo com verificado_em velho
 *  6. Financeiro — conferencia_financeira parada em "persistente"/
 *     "aguardando" há muito tempo
 *  7. Métricas e scores — snapshot diário de ontem/hoje, score_cliente e
 *     score_produto recalculados nas últimas 24h
 *
 * Não corrige nada, só aponta. Uso:
 *
 *   node --import tsx --import ./scripts/register-server-only.mjs \
 *        --env-file=.env.local scripts/encanador.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, getDb } from "../src/shared/lib/db/index";
import { brand } from "../src/shared/lib/db/schema/org";
import { channelAccount, canalVerificacao, sincronizacaoExecucao } from "../src/shared/lib/db/schema/canais";
import { jobRun } from "../src/shared/lib/db/schema/auditoria";
import { pedido, pedidoItem, conferenciaFinanceira } from "../src/shared/lib/db/schema/vendas";
import { produto, produtoCanal, estoqueCanalSaldo } from "../src/shared/lib/db/schema/estoque";
import { cliente } from "../src/shared/lib/db/schema/clientes";
import { metricasSnapshotDiario } from "../src/shared/lib/db/schema/metricas";
import { scoreCliente, scoreProduto } from "../src/shared/lib/db/schema/scoring";

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID obrigatório.");

const AGORA = new Date();
const problemas: string[] = [];
const ok: string[] = [];
const avisos: string[] = [];

function h(titulo: string) {
  console.log(`\n════ ${titulo} ════`);
}
function falha(msg: string) { problemas.push(msg); console.log(`  ✗ ${msg}`); }
function bom(msg: string) { ok.push(msg); console.log(`  ✓ ${msg}`); }
function aviso(msg: string) { avisos.push(msg); console.log(`  ! ${msg}`); }
function horasDesde(d: Date | null): number | null {
  return d ? (AGORA.getTime() - d.getTime()) / 3_600_000 : null;
}

// ── 1. arquivos de job vs. o que o route.ts realmente serve ─────────────────
h("1. Registro no Inngest (arquivo escrito ≠ arquivo servido)");
const pastaJobs = "./src/modules/jobs";
const arquivos = readdirSync(pastaJobs).filter((f) => /^A\d+-.*\.ts$/.test(f));
const routeSrc = readFileSync("./src/app/api/inngest/route.ts", "utf8");
const blocoFunctions = routeSrc.match(/functions:\s*\[([\s\S]*?)\]\s*,\s*\}\);/)?.[1] ?? "";
const jobsDesativados = new Map<string, string>([
  [
    "A7-encalhe",
    "suspenso para reduzir consumo; o score de encalhe continua sendo recalculado pela A14",
  ],
  [
    "A12-conversa-parada",
    "suspenso para reduzir consumo e evitar alertas repetidos até receber processamento em lote com deduplicação",
  ],
]);
const jobsAtivosComGatilho: string[] = [];
let jobsAtivosNaoServidos = 0;
for (const f of arquivos) {
  const conteudo = readFileSync(`${pastaJobs}/${f}`, "utf8");
  const idMatch = conteudo.match(/id:\s*"([^"]+)"/);
  const temGatilho = /triggers:\s*\[\{\s*(cron|event):/.test(conteudo);
  if (!idMatch || !temGatilho) continue;
  const id = idMatch[1];
  const funcMatch = conteudo.match(/export const (\w+)\s*=\s*inngest\.createFunction/);
  const nomeExport = funcMatch?.[1];
  const servido = nomeExport ? new RegExp(`\\b${nomeExport}\\b`).test(blocoFunctions) : false;
  const motivoDesativacao = jobsDesativados.get(id);
  if (motivoDesativacao) {
    if (servido) falha(`${id} (${f}) está marcado como suspenso, mas voltou a ser servido pelo route.ts.`);
    else aviso(`${id} (${f}) desativado intencionalmente — ${motivoDesativacao}.`);
    continue;
  }
  jobsAtivosComGatilho.push(id);
  if (!servido) {
    jobsAtivosNaoServidos += 1;
    falha(`${id} (${f}) tem trigger declarado mas NÃO está em functions[] de route.ts — nunca roda.`);
  }
}
if (jobsAtivosNaoServidos === 0) bom(`${jobsAtivosComGatilho.length} jobs ativos com trigger, todos servidos pelo route.ts.`);

// ── 2. job_run: cadência e falhas recentes ───────────────────────────────────
h("2. job_run — cadência e falhas (48h)");
const desde48h = new Date(AGORA.getTime() - 48 * 3_600_000);
const execucoes = await db
  .select({ nome: jobRun.nome, status: jobRun.status, iniciadoEm: jobRun.iniciadoEm, erro: jobRun.erro })
  .from(jobRun)
  .where(gt(jobRun.iniciadoEm, desde48h));
const porNome = new Map<string, typeof execucoes>();
for (const e of execucoes) { const a = porNome.get(e.nome) ?? []; a.push(e); porNome.set(e.nome, a); }

// Jobs com cron que deveriam ter aparecido em job_run nas últimas 48h
// (identificados por chamarem iniciarJob no próprio arquivo).
const jobsComMonitor = arquivos
  .filter((f) => readFileSync(`${pastaJobs}/${f}`, "utf8").includes("iniciarJob"))
  .map((f) => {
    const conteudo = readFileSync(`${pastaJobs}/${f}`, "utf8");
    const id = conteudo.match(/id:\s*"([^"]+)"/)?.[1] ?? f;
    const cron = conteudo.match(/cron:\s*`?"?([^`"}\n]+)`?"?\s*[}\]]/)?.[1];
    return { id, cron };
  });

/** Mesmos limites do monitor operacional. O diagnóstico usa a idade real da
 * última execução, não apenas "apareceu alguma coisa nas últimas 48h". */
const limiteAtrasoHoras: Record<string, number> = {
  "A24-poll-pedidos": 6,
  "A34-reconciliar-pedidos": 48,
  "A35-auditar-financeiro": 48,
  "A18-saude-conectores": 6,
  "A28-sync-avaliacoes-ml": 12,
  "A32-sync-anuncios-ads": 36,
  "A23-refresh-ml-tokens": 3,
  "A33-refresh-shopee-tokens": 3,
};

for (const { id, cron } of jobsComMonitor) {
  const runs = (porNome.get(id) ?? []).sort((a, b) => b.iniciadoEm.getTime() - a.iniciadoEm.getTime());
  if (runs.length === 0) {
    falha(`${id}${cron ? ` (cron "${cron}")` : ""} — nenhuma execução em job_run nas últimas 48h.`);
    continue;
  }
  const falhasRecentes = runs.filter((r) => r.status === "falhou");
  const ultima = runs[0];
  const horas = horasDesde(ultima.iniciadoEm);
  let linha = `${id} — última execução há ${horas!.toFixed(1)}h (${ultima.status})`;
  if (falhasRecentes.length) linha += `, ${falhasRecentes.length} falha(s) em 48h`;
  const atrasado = horas! > (limiteAtrasoHoras[id] ?? 48);
  if (atrasado) linha += `, limite ${(limiteAtrasoHoras[id] ?? 48).toFixed(0)}h`;
  if (falhasRecentes.length || ultima.status === "falhou" || atrasado) falha(linha);
  else bom(linha);
}

// A34 só despacha; quem efetivamente busca e ingere os pedidos é A31. Um
// job_run verde sem execução filha seria falso positivo de saúde da pipeline.
const reconciliacoesA34 = await db
  .select({
    id: sincronizacaoExecucao.id,
    status: sincronizacaoExecucao.pedidosStatus,
    erro: sincronizacaoExecucao.pedidosErro,
    iniciadoEm: sincronizacaoExecucao.iniciadoEm,
    finalizadoEm: sincronizacaoExecucao.finalizadoEm,
  })
  .from(sincronizacaoExecucao)
  .where(and(
    eq(sincronizacaoExecucao.orgId, orgId),
    gt(sincronizacaoExecucao.iniciadoEm, desde48h),
    sql`${sincronizacaoExecucao.pedidosResultado}->>'origem' = 'A34'`,
  ));
if ((porNome.get("A34-reconciliar-pedidos") ?? []).length > 0 && reconciliacoesA34.length === 0) {
  falha("A34 apareceu em job_run, mas nenhuma execução filha A31 foi identificada nas últimas 48h.");
} else if (reconciliacoesA34.some((item) => item.status === "erro")) {
  falha(`${reconciliacoesA34.filter((item) => item.status === "erro").length} execução(ões) A31 disparada(s) pela A34 terminaram com erro.`);
} else if (reconciliacoesA34.length > 0) {
  bom(`${reconciliacoesA34.length} execução(ões) filha(s) A31 da A34 identificada(s) nas últimas 48h.`);
}

// ── 3. Canais: contas, verificação e frescor ────────────────────────────────
h("3. Canais conectados e frescor de verificação");
const contas = await db
  .select({
    id: channelAccount.id, tipo: channelAccount.tipo, status: channelAccount.status,
    marca: brand.slug, ultimoErro: channelAccount.ultimoErro, ultimaVerificacao: channelAccount.ultimaVerificacao,
  })
  .from(channelAccount)
  .innerJoin(brand, eq(brand.id, channelAccount.brandId))
  .where(eq(channelAccount.orgId, orgId));

for (const c of contas) {
  const rotulo = `${c.marca}/${c.tipo}`;
  if (c.status !== "conectado") {
    falha(`${rotulo} — status "${c.status}"${c.ultimoErro ? `: ${c.ultimoErro}` : ""}`);
  } else {
    bom(`${rotulo} — conectado`);
  }
}

const verificacoes = await db
  .select({ channelAccountId: canalVerificacao.channelAccountId, modulo: canalVerificacao.modulo, verificadoEm: canalVerificacao.verificadoEm })
  .from(canalVerificacao)
  .where(eq(canalVerificacao.orgId, orgId));
const porConta = new Map(contas.map((c) => [c.id, c]));
for (const v of verificacoes) {
  const conta = porConta.get(v.channelAccountId);
  if (!conta) continue;
  const horas = horasDesde(v.verificadoEm)!;
  if (horas > 24) falha(`${conta.marca}/${conta.tipo} · módulo "${v.modulo}" — verificado há ${horas.toFixed(0)}h.`);
}

// ── 4. Pedido → item → produto ───────────────────────────────────────────────
h("4. Integridade pedido → item → produto");
const [{ n: pedidosSemItem }] = await db.execute<{ n: number }>(sql`
  select count(*)::int as n from ${pedido} p
  where p.org_id = ${orgId}
    and p.status not in ('cancelado')
    and not exists (select 1 from ${pedidoItem} i where i.pedido_id = p.id)
`);
if (pedidosSemItem > 0) falha(`${pedidosSemItem} pedido(s) não cancelados sem nenhum item.`);
else bom("nenhum pedido órfão de item.");

const [{ n: itensSemProduto }] = await db.execute<{ n: number }>(sql`
  select count(*)::int as n from ${pedidoItem} i
  where not exists (select 1 from ${produto} p where p.id = i.produto_id)
`);
if (itensSemProduto > 0) falha(`${itensSemProduto} item(ns) de pedido apontando para produto inexistente.`);
else bom("todo item de pedido aponta para um produto existente.");

const [{ n: produtosSemCanal }] = await db.execute<{ n: number }>(sql`
  select count(*)::int as n from ${produto} p
  where p.org_id = ${orgId} and p.ativo = true and p.deleted_at is null
    and not exists (select 1 from ${produtoCanal} pc where pc.produto_id = p.id and pc.ativo = true)
`);
if (produtosSemCanal > 0) falha(`${produtosSemCanal} produto(s) ativo(s) sem nenhum anúncio de canal ativo vinculado.`);
else bom("todo produto ativo tem ao menos um anúncio de canal.");

// ── 5. Estoque por canal ─────────────────────────────────────────────────────
h("5. Estoque por canal — frescor do saldo");
type CoberturaEstoque = { total: number; semSaldo: number; novosSemSaldo: number; velhos: number };
const [{ total, semSaldo, novosSemSaldo, velhos }] = await db.execute<CoberturaEstoque>(sql`
  select count(*)::int as total,
         count(*) filter (
           where e.id is null
             and pc.criado_em < now() - interval '12 hours'
         )::int as "semSaldo",
         count(*) filter (
           where e.id is null
             and pc.criado_em >= now() - interval '12 hours'
         )::int as "novosSemSaldo",
         count(*) filter (
           where e.verificado_em < now() - interval '12 hours'
         )::int as velhos
    from ${produtoCanal} pc
    inner join ${produto} p
      on p.id = pc.produto_id and p.org_id = pc.org_id
    inner join ${channelAccount} ca
      on ca.id = pc.channel_account_id and ca.org_id = pc.org_id
    left join ${estoqueCanalSaldo} e
      on e.produto_canal_id = pc.id and e.org_id = pc.org_id
   where pc.org_id = ${orgId}
     and pc.ativo = true
     and p.ativo = true
     and p.deleted_at is null
     and ca.status = 'conectado'
`);
if (total === 0) {
  falha("nenhum anúncio ativo em conta conectada para conferir saldo.");
} else {
  if (semSaldo > 0) falha(`${semSaldo} de ${total} anúncio(s) ativo(s) estão sem saldo após a janela de 12h.`);
  if (velhos > 0) falha(`${velhos} de ${total} anúncio(s) ativo(s) têm saldo sem verificação há mais de 12h.`);
  if (novosSemSaldo > 0) aviso(`${novosSemSaldo} anúncio(s) novo(s) ainda aguardam a primeira coleta dentro da janela de 12h.`);
  if (semSaldo === 0 && velhos === 0 && novosSemSaldo === 0) {
    bom(`${total} anúncio(s) ativo(s), todos com saldo verificado nas últimas 12h.`);
  }
}

// ── 6. Financeiro ─────────────────────────────────────────────────────────────
h("6. Conferência financeira (conferencia_financeira)");
type LinhaComposicaoFinanceira = {
  canal: string;
  pedidos: number;
  pedidosBrutos: string;
  faturamentoValido: string;
  canceladosDevolvidos: string;
  freteZero: number;
  pedidosReembolsados: number;
  valorReembolsado: string;
};
const desde30d = new Date(AGORA.getTime() - 30 * 86_400_000);
const composicaoFinanceira = await db.execute<LinhaComposicaoFinanceira>(sql`
  with base as (
    select p.id, p.canal, p.status, p.total, p.frete, p.dados_origem
    from ${pedido} p
    where p.org_id = ${orgId}
      and p.criado_em >= ${desde30d.toISOString()}::timestamptz
  ), reembolso as (
    select b.id, coalesce(sum(
      case
        when pagamento->>'reembolsado' ~ '^[0-9]+([.][0-9]+)?$'
          then (pagamento->>'reembolsado')::numeric
        else 0
      end
    ), 0) as valor
    from base b
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(b.dados_origem->'pagamentos') = 'array'
        then b.dados_origem->'pagamentos' else '[]'::jsonb end
    ) pagamento on true
    group by b.id
  )
  select
    b.canal,
    count(*)::int as pedidos,
    coalesce(sum(b.total), 0)::text as "pedidosBrutos",
    coalesce(sum(b.total) filter (where b.status not in ('cancelado', 'devolvido')), 0)::text as "faturamentoValido",
    coalesce(sum(b.total) filter (where b.status in ('cancelado', 'devolvido')), 0)::text as "canceladosDevolvidos",
    count(*) filter (where b.status not in ('cancelado', 'devolvido') and coalesce(b.frete, 0) = 0)::int as "freteZero",
    count(*) filter (where r.valor > 0)::int as "pedidosReembolsados",
    coalesce(sum(r.valor), 0)::text as "valorReembolsado"
  from base b
  inner join reembolso r on r.id = b.id
  group by b.canal
  order by b.canal
`);

const moeda = (valor: string | number) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
for (const linha of composicaoFinanceira) {
  bom(
    `${linha.canal} (30d): pedidos brutos ${moeda(linha.pedidosBrutos)} − cancelados/devolvidos `
    + `${moeda(linha.canceladosDevolvidos)} = faturamento válido ${moeda(linha.faturamentoValido)}.`,
  );
  if (linha.pedidosReembolsados > 0) {
    aviso(
      `${linha.canal}: ${linha.pedidosReembolsados} pedido(s) com ${moeda(linha.valorReembolsado)} reembolsados; `
      + "valor mantido em sombra e ainda não abatido do faturamento legado.",
    );
  }
  if (linha.canal === "mercadolivre" && linha.freteZero > 0) {
    aviso(
      `mercadolivre: ${linha.freteZero} pedido(s) válido(s) com frete 0; o schema atual não distingue frete realmente zero de consulta de custo que falhou.`,
    );
  }
}

const desde7d = new Date(AGORA.getTime() - 7 * 86_400_000);
const pendentes = await db
  .select({ status: conferenciaFinanceira.status, canal: conferenciaFinanceira.canal, providerOrderId: conferenciaFinanceira.providerOrderId, primeiraDeteccaoEm: conferenciaFinanceira.primeiraDeteccaoEm })
  .from(conferenciaFinanceira)
  .where(and(
    eq(conferenciaFinanceira.orgId, orgId),
    inArray(conferenciaFinanceira.status, ["persistente", "aguardando", "detectado"]),
  ));
const antigas = pendentes.filter((p) => p.primeiraDeteccaoEm < desde7d);
if (antigas.length > 0) {
  falha(`${antigas.length} divergência(s) financeira(s) abertas há mais de 7 dias (de ${pendentes.length} pendentes no total).`);
  for (const a of antigas.slice(0, 10)) console.log(`      ${a.canal} ${a.providerOrderId ?? "?"} — ${a.status} desde ${a.primeiraDeteccaoEm.toISOString().slice(0, 10)}`);
} else if (pendentes.length > 0) {
  bom(`${pendentes.length} divergência(s) pendente(s), todas com menos de 7 dias — dentro do ciclo normal do A35.`);
} else {
  bom("nenhuma divergência financeira pendente.");
}

// ── 7. Métricas e scores ─────────────────────────────────────────────────────
h("7. Métricas e scores diários");
const [ultimoSnapshot] = await db
  .select({ data: metricasSnapshotDiario.data, createdAt: metricasSnapshotDiario.createdAt })
  .from(metricasSnapshotDiario)
  .where(eq(metricasSnapshotDiario.orgId, orgId))
  .orderBy(sql`${metricasSnapshotDiario.data} desc`)
  .limit(1);
if (!ultimoSnapshot) falha("nenhum snapshot em metricas_snapshot_diario.");
else {
  const horas = horasDesde(ultimoSnapshot.createdAt)!;
  if (horas > 30) falha(`último snapshot de métricas é de ${ultimoSnapshot.data} (${horas.toFixed(0)}h atrás) — A30 não rodou hoje.`);
  else bom(`snapshot de métricas atual (${ultimoSnapshot.data}).`);
}

type CoberturaScore = { total: number; semScore: number; novosSemScore: number; scoresVelhos: number };
const [{
  total: totalClientes,
  semScore: clientesSemScore,
  novosSemScore: clientesNovosSemScore,
  scoresVelhos: clientesVelhos,
}] =
  await db.execute<CoberturaScore>(sql`
    select count(*)::int as total,
           count(*) filter (
             where sc.id is null
               and c.criado_em < now() - interval '36 hours'
           )::int as "semScore",
           count(*) filter (
             where sc.id is null
               and c.criado_em >= now() - interval '36 hours'
           )::int as "novosSemScore",
           count(*) filter (
             where sc.calculado_em < now() - interval '36 hours'
           )::int as "scoresVelhos"
      from ${cliente} c
      left join ${scoreCliente} sc
        on sc.cliente_id = c.id and sc.org_id = c.org_id
     where c.org_id = ${orgId}
       and c.deleted_at is null
  `);
if (totalClientes === 0) {
  falha("nenhum cliente ativo para conferir score_cliente.");
} else {
  if (clientesSemScore > 0) falha(`${clientesSemScore} de ${totalClientes} cliente(s) ativo(s) estão sem score_cliente após a janela de 36h.`);
  if (clientesVelhos > 0) falha(`${clientesVelhos} de ${totalClientes} score_cliente ativo(s) não foram recalculados há mais de 36h.`);
  if (clientesNovosSemScore > 0) aviso(`${clientesNovosSemScore} cliente(s) novo(s) aguardam o próximo cálculo dentro da janela de 36h.`);
  if (clientesSemScore === 0 && clientesVelhos === 0 && clientesNovosSemScore === 0) {
    bom(`${totalClientes} cliente(s) ativo(s), todos com score recalculado nas últimas 36h.`);
  }
}

const [{
  total: totalProdutos,
  semScore: produtosSemScore,
  novosSemScore: produtosNovosSemScore,
  scoresVelhos: produtosVelhos,
}] =
  await db.execute<CoberturaScore>(sql`
    select count(*)::int as total,
           count(*) filter (
             where sp.id is null
               and p.criado_em < now() - interval '36 hours'
           )::int as "semScore",
           count(*) filter (
             where sp.id is null
               and p.criado_em >= now() - interval '36 hours'
           )::int as "novosSemScore",
           count(*) filter (
             where sp.calculado_em < now() - interval '36 hours'
           )::int as "scoresVelhos"
      from ${produto} p
      left join ${scoreProduto} sp
        on sp.produto_id = p.id and sp.org_id = p.org_id
     where p.org_id = ${orgId}
       and p.ativo = true
       and p.deleted_at is null
  `);
if (totalProdutos === 0) {
  falha("nenhum produto ativo para conferir score_produto.");
} else {
  if (produtosSemScore > 0) falha(`${produtosSemScore} de ${totalProdutos} produto(s) ativo(s) estão sem score_produto após a janela de 36h.`);
  if (produtosVelhos > 0) falha(`${produtosVelhos} de ${totalProdutos} score_produto ativo(s) não foram recalculados há mais de 36h.`);
  if (produtosNovosSemScore > 0) aviso(`${produtosNovosSemScore} produto(s) novo(s) aguardam o próximo cálculo dentro da janela de 36h.`);
  if (produtosSemScore === 0 && produtosVelhos === 0 && produtosNovosSemScore === 0) {
    bom(`${totalProdutos} produto(s) ativo(s), todos com score recalculado nas últimas 36h.`);
  }
}

// ── resumo ────────────────────────────────────────────────────────────────
h("RESUMO");
console.log(`${ok.length} check(s) ok · ${avisos.length} aviso(s) · ${problemas.length} problema(s)`);
if (avisos.length) {
  console.log("\nAvisos de diagnóstico (não alteram o exit code):");
  for (const a of avisos) console.log(`  ! ${a}`);
}
if (problemas.length) {
  console.log("\nProblemas encontrados:");
  for (const p of problemas) console.log(`  ✗ ${p}`);
}

await getDb().$client.end({ timeout: 10 });
if (problemas.length > 0) process.exitCode = 1;
