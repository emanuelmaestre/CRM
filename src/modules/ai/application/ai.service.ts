import { eq, and, gte, sum, desc, gt, count, sql, isNotNull } from "drizzle-orm";
import type { ZodType } from "zod";
import { db } from "@/shared/lib/db";
import { llmRun, sugestaoCampanha, insight, scoreCliente, produto } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import {
  MODELOS, calcularCusto,
  SugestaoCampanhaOutputSchema, InsightOutputSchema, DocumentoExecutivoOutputSchema,
  OPENAI_JSON_SCHEMAS,
  type SugestaoCampanhaOutput, type InsightOutput, type DocumentoExecutivoOutput,
} from "../domain/guardrails";
import { startOfMonth } from "date-fns";

function obterOrcamentoMensal(): number {
  const valor = Number(process.env.AI_MONTHLY_BUDGET_USD ?? 20);
  return Number.isFinite(valor) && valor > 0 ? valor : 20;
}

async function consumoMesAtual(orgId: string): Promise<number> {
  const inicio = startOfMonth(new Date());
  const resultado = await db
    .select({ total: sum(llmRun.custoUsd) })
    .from(llmRun)
    .where(and(eq(llmRun.orgId, orgId), gte(llmRun.createdAt, inicio)));
  return parseFloat(resultado[0]?.total ?? "0");
}

async function registrarLlmRun(opts: {
  orgId: string;
  finalidade: string;
  modelo: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  custoUsd: number;
  duracaoMs: number;
  sucesso: boolean;
  erro?: string;
}): Promise<void> {
  await db.insert(llmRun).values({
    orgId: opts.orgId,
    finalidade: opts.finalidade,
    modelo: opts.modelo,
    promptVersion: opts.promptVersion,
    tokensInput: opts.tokensInput,
    tokensOutput: opts.tokensOutput,
    custoUsd: opts.custoUsd.toFixed(6),
    duracaoMs: opts.duracaoMs,
    sucesso: opts.sucesso ? "true" : "false",
    erro: opts.erro,
  });
}

async function chamarOpenAIEstruturado<T>(opts: {
  orgId: string;
  modelo: (typeof MODELOS)[keyof typeof MODELOS];
  finalidade: string;
  promptVersion: string;
  mensagens: { role: "system" | "user"; content: string }[];
  schemaName: keyof typeof OPENAI_JSON_SCHEMAS;
  schema: ZodType<T>;
}): Promise<T> {
  const orcamentoMensal = obterOrcamentoMensal();
  const alerta70 = orcamentoMensal * 0.7;
  const alerta90 = orcamentoMensal * 0.9;
  const consumo = await consumoMesAtual(opts.orgId);

  if (consumo >= orcamentoMensal) {
    await emitirEvento({
      tipo: "ia.limite_consumo_atingido",
      orgId: opts.orgId,
      entidade: "llm_run",
      entidadeId: opts.orgId,
      payload: { consumoAtual: consumo, limite: orcamentoMensal },
    });
    throw new Error("Orçamento de IA atingido. Insights pausados até o próximo ciclo.");
  }

  if (consumo >= alerta90) {
    await emitirEvento({
      tipo: "ia.limite_consumo_atingido",
      orgId: opts.orgId,
      entidade: "llm_run",
      entidadeId: opts.orgId,
      payload: { consumoAtual: consumo, limite: orcamentoMensal, alerta: "90%" },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  let mensagens = [...opts.mensagens];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const inicio = Date.now();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: opts.modelo,
        messages: mensagens,
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: OPENAI_JSON_SCHEMAS[opts.schemaName] },
        },
        temperature: 0.3,
      }),
    });
    const duracaoMs = Date.now() - inicio;
    if (!res.ok) {
      const erro = await res.text();
      await registrarLlmRun({ ...opts, tokensInput: 0, tokensOutput: 0, custoUsd: 0, duracaoMs, sucesso: false, erro });
      throw new Error(`OpenAI erro ${res.status}: ${erro}`);
    }
    const data = await res.json() as {
      choices?: { message?: { content?: string; refusal?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const tokensInput = data.usage?.prompt_tokens ?? 0;
    const tokensOutput = data.usage?.completion_tokens ?? 0;
    const custoUsd = calcularCusto(opts.modelo, tokensInput, tokensOutput);
    const conteudo = data.choices?.[0]?.message?.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(conteudo);
    } catch {
      json = null;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) {
      await registrarLlmRun({ ...opts, tokensInput, tokensOutput, custoUsd, duracaoMs, sucesso: true });
      if (consumo + custoUsd >= alerta70 && consumo < alerta70) {
        await emitirEvento({
          tipo: "ia.limite_consumo_atingido", orgId: opts.orgId,
          entidade: "llm_run", entidadeId: opts.orgId,
          payload: { consumoAtual: consumo + custoUsd, alerta: "70%" },
        });
      }
      return parsed.data;
    }
    const erroValidacao = `Saída estruturada inválida (tentativa ${tentativa}): ${parsed.error.message}`;
    await registrarLlmRun({ ...opts, tokensInput, tokensOutput, custoUsd, duracaoMs, sucesso: false, erro: erroValidacao });
    mensagens = [
      ...opts.mensagens,
      { role: "user", content: `A saída anterior falhou na validação. Corrija e responda novamente no schema exigido. Erro: ${parsed.error.message}` },
    ];
  }
  throw new Error("Saída da IA inválida após uma tentativa de reparo.");
}

const MARGEM_MINIMA_PADRAO = 0.15;

// Teto de desconto que preserva a margem mínima, com base no custo/preço
// médio real dos produtos ativos da org. A IA sugere um desconto livremente,
// mas nunca é persistido acima deste teto — sem isso, nada impede a IA de
// sugerir um desconto que vende abaixo do custo.
async function obterTetoDescontoPelaMargem(orgId: string): Promise<number | null> {
  const [agregado] = await db
    .select({
      custoMedio: sql<string>`avg(${produto.custo})`,
      precoMedio: sql<string>`avg(${produto.preco})`,
    })
    .from(produto)
    .where(and(eq(produto.orgId, orgId), eq(produto.ativo, true), isNotNull(produto.custo)));

  const custoMedio = parseFloat(agregado?.custoMedio ?? "");
  const precoMedio = parseFloat(agregado?.precoMedio ?? "");
  if (!Number.isFinite(custoMedio) || !Number.isFinite(precoMedio) || precoMedio <= 0) return null;

  const precoMinimo = custoMedio / (1 - MARGEM_MINIMA_PADRAO);
  return Math.max(0, Math.min(100, (1 - precoMinimo / precoMedio) * 100));
}

export async function gerarSugestoesCampanha(orgId: string): Promise<{ gerado: boolean; motivo?: string; id?: string }> {
  const clientes_em_risco = await db
    .select({ clienteId: scoreCliente.clienteId, churnRisk: scoreCliente.churnRisk, explicacao: scoreCliente.explicacao })
    .from(scoreCliente)
    .where(and(eq(scoreCliente.orgId, orgId), gte(scoreCliente.churnRisk, 60)))
    .limit(50);

  if (clientes_em_risco.length === 0) return { gerado: false, motivo: "sem_clientes_em_risco" };

  const promptVersion = "sugestao-campanha-v2";
  const sistemaPrompt = `Você é um analista de CRM especialista em retenção.
Analise os dados de clientes em risco de churn e sugira UMA campanha de reativação.
Responda SOMENTE em JSON com: titulo, segmentoDescricao, oferta, momentoSugerido (melhor dia/horário ou janela para disparar, ex: "terça a quinta, 10h-12h"), descontoMinimo (número 0-100), justificativa.
Use apenas agregados. NÃO mencione clientes individuais.`;

  const userPrompt = `Dados agregados:
- ${clientes_em_risco.length} clientes com churn_risk ≥ 60
- Score médio: ${Math.round(clientes_em_risco.reduce((a, c) => a + c.churnRisk, 0) / clientes_em_risco.length)}
- Exemplos de explicação: ${clientes_em_risco.slice(0, 3).map((c) => c.explicacao).join(" | ")}

Sugira uma campanha de reativação concisa e objetiva.`;

  const output: SugestaoCampanhaOutput = await chamarOpenAIEstruturado({
    orgId, modelo: MODELOS.triagem, finalidade: "sugestao_campanha", promptVersion,
    schemaName: "sugestao_campanha", schema: SugestaoCampanhaOutputSchema,
    mensagens: [
      { role: "system", content: sistemaPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const tetoMargem = await obterTetoDescontoPelaMargem(orgId);
  const descontoFinal = tetoMargem != null ? Math.min(output.descontoMinimo, tetoMargem) : output.descontoMinimo;

  const [nova] = await db.insert(sugestaoCampanha).values({
    orgId,
    titulo: output.titulo,
    segmentoDescricao: output.segmentoDescricao,
    oferta: output.oferta,
    momentoSugerido: output.momentoSugerido,
    descontoMinimo: descontoFinal.toFixed(2),
    status: "sugerida",
    modeloUsado: MODELOS.triagem,
    promptVersion,
    expiradoEm: new Date(Date.now() + 14 * 86_400_000),
  }).returning();

  await emitirEvento({
    tipo: "ia.sugestao_criada",
    orgId,
    entidade: "sugestao_campanha",
    entidadeId: nova.id,
    payload: { titulo: output.titulo },
  });
  return { gerado: true, id: nova.id };
}

export async function aprovarSugestao(orgId: string, sugestaoId: string, aprovadoPorId: string): Promise<void> {
  const [atualizada] = await db
    .update(sugestaoCampanha)
    .set({ status: "aprovada", aprovadoPorId, updatedAt: new Date() })
    .where(and(
      eq(sugestaoCampanha.id, sugestaoId), eq(sugestaoCampanha.orgId, orgId),
      eq(sugestaoCampanha.status, "sugerida"), gt(sugestaoCampanha.expiradoEm, new Date()),
    ))
    .returning({ id: sugestaoCampanha.id });
  if (!atualizada) throw new Error("Sugestão inexistente, expirada ou já decidida.");

  await emitirEvento({
    tipo: "ia.sugestao_aprovada",
    orgId,
    entidade: "sugestao_campanha",
    entidadeId: sugestaoId,
    payload: { aprovadoPorId },
  });
}

export async function rejeitarSugestao(orgId: string, sugestaoId: string, motivo: string): Promise<void> {
  const [atualizada] = await db
    .update(sugestaoCampanha)
    .set({ status: "rejeitada", motivoRejeicao: motivo, updatedAt: new Date() })
    .where(and(
      eq(sugestaoCampanha.id, sugestaoId), eq(sugestaoCampanha.orgId, orgId),
      eq(sugestaoCampanha.status, "sugerida"), gt(sugestaoCampanha.expiradoEm, new Date()),
    ))
    .returning({ id: sugestaoCampanha.id });
  if (!atualizada) throw new Error("Sugestão inexistente, expirada ou já decidida.");

  await emitirEvento({
    tipo: "ia.sugestao_rejeitada",
    orgId,
    entidade: "sugestao_campanha",
    entidadeId: sugestaoId,
    payload: { motivo },
  });
}

export async function gerarInsightFunil(orgId: string, dadosAgregados: Record<string, unknown>): Promise<{ gerado: true; id: string }> {
  const promptVersion = "insight-funil-v1";
  const sistemaPrompt = `Você é um analista de negócios especialista em e-commerce brasileiro.
Analise os dados agregados de funil de vendas e gere insights executivos em português.
Responda em JSON com: titulo, conteudo, numerosFonte (array de objetos {nome, valor}), confianca (0-1).
Cada afirmação no conteudo deve citar um valor de numerosFonte.
NÃO invente dados. Use apenas o que foi fornecido.`;

  const userPrompt = `Dados do funil (últimos 30 dias):\n${JSON.stringify(dadosAgregados, null, 2)}`;

  const output: InsightOutput = await chamarOpenAIEstruturado({
    orgId, modelo: MODELOS.insight, finalidade: "insight_funil", promptVersion,
    schemaName: "insight_funil", schema: InsightOutputSchema,
    mensagens: [
      { role: "system", content: sistemaPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const [novo] = await db.insert(insight).values({
    orgId,
    tipo: "funil",
    titulo: output.titulo,
    conteudo: output.conteudo,
    numerosfonte: output.numerosFonte,
    confianca: output.confianca.toFixed(3),
    validoAte: new Date(Date.now() + 7 * 86_400_000),
    modeloUsado: MODELOS.insight,
    promptVersion,
  }).returning();

  await emitirEvento({
    tipo: "ia.insight_gerado",
    orgId,
    entidade: "insight",
    entidadeId: novo.id,
    payload: { tipo: "funil", titulo: output.titulo },
  });
  return { gerado: true, id: novo.id };
}

export async function listarSugestoes(orgId: string, status?: string) {
  const conditions = [eq(sugestaoCampanha.orgId, orgId)];
  if (status) conditions.push(eq(sugestaoCampanha.status, status));
  return db.select().from(sugestaoCampanha).where(and(...conditions));
}

export async function gerarDocumentoExecutivo(
  orgId: string,
  dados: {
    receitaTotal: number;
    totalPedidos: number;
    canaisAtivos: number;
    clientesEmRisco: number;
    sugestoesPendentes: number;
    periodo: string;
  },
): Promise<DocumentoExecutivoOutput> {
  const promptVersion = "documento-executivo-v1";
  const sistemaPrompt = `Você é um consultor de CRM sênior gerando um relatório executivo em português brasileiro.
Analise os KPIs fornecidos e produza um documento executivo conciso.
Responda SOMENTE em JSON com: titulo, resumo, destaques (array de strings), alertas (array de strings), recomendacoes (array de strings).
Seja objetivo, use números reais dos dados, evite jargão excessivo.`;

  const userPrompt = `KPIs do período ${dados.periodo}:
- Receita total: R$ ${dados.receitaTotal.toFixed(2)}
- Total de pedidos: ${dados.totalPedidos}
- Canais ativos: ${dados.canaisAtivos}
- Clientes em risco de churn (score ≥ 60): ${dados.clientesEmRisco}
- Sugestões de campanha pendentes: ${dados.sugestoesPendentes}

Gere um relatório executivo com destaques positivos, alertas e recomendações de ação.`;

  return chamarOpenAIEstruturado({
    orgId,
    modelo: MODELOS.insight,
    finalidade: "documento_executivo",
    promptVersion,
    schemaName: "documento_executivo",
    schema: DocumentoExecutivoOutputSchema,
    mensagens: [
      { role: "system", content: sistemaPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

export async function listarInsights(orgId: string, limite = 5) {
  return db
    .select()
    .from(insight)
    .where(eq(insight.orgId, orgId))
    .orderBy(desc(insight.createdAt))
    .limit(limite);
}

export async function consultarConsumoIA(orgId: string) {
  const orcamentoMensal = obterOrcamentoMensal();
  const alerta70 = orcamentoMensal * 0.7;
  const alerta90 = orcamentoMensal * 0.9;
  const inicio = startOfMonth(new Date());
  const resultado = await db
    .select({ total: sum(llmRun.custoUsd) })
    .from(llmRun)
    .where(and(eq(llmRun.orgId, orgId), gte(llmRun.createdAt, inicio)));

  const consumoAtual = parseFloat(resultado[0]?.total ?? "0");
  return {
    consumoAtualUsd: consumoAtual,
    orcamentoUsd: orcamentoMensal,
    percentual: Math.round((consumoAtual / orcamentoMensal) * 100),
    alerta: consumoAtual >= alerta90 ? "90%" : consumoAtual >= alerta70 ? "70%" : null,
  };
}

export async function obterConsumoDetalhado(orgId: string) {
  const resumo = await consultarConsumoIA(orgId);
  const inicio = startOfMonth(new Date());

  const porFinalidade = await db
    .select({
      finalidade: llmRun.finalidade,
      custo: sum(llmRun.custoUsd),
      runs: count(llmRun.id),
    })
    .from(llmRun)
    .where(and(eq(llmRun.orgId, orgId), gte(llmRun.createdAt, inicio)))
    .groupBy(llmRun.finalidade)
    .orderBy(desc(sum(llmRun.custoUsd)));

  const totalRuns = await db
    .select({ total: count(llmRun.id), sucesso: count(sql`case when ${llmRun.sucesso} = 'true' then 1 end`) })
    .from(llmRun)
    .where(and(eq(llmRun.orgId, orgId), gte(llmRun.createdAt, inicio)));

  const recentes = await db
    .select()
    .from(llmRun)
    .where(eq(llmRun.orgId, orgId))
    .orderBy(desc(llmRun.createdAt))
    .limit(30);

  const total = totalRuns[0]?.total ?? 0;
  const sucesso = totalRuns[0]?.sucesso ?? 0;

  return {
    ...resumo,
    totalRuns: total,
    taxaSucesso: total > 0 ? Math.round((sucesso / total) * 100) : 100,
    porFinalidade: porFinalidade.map((item) => ({
      finalidade: item.finalidade,
      custoUsd: parseFloat(item.custo ?? "0"),
      runs: item.runs,
    })),
    recentes,
  };
}
