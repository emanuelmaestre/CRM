import { eq, and, gte, sum, desc } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { llmRun, sugestaoCampanha, insight, scoreCliente } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import {
  MODELOS, calcularCusto,
  SugestaoCampanhaOutputSchema, InsightOutputSchema, DocumentoExecutivoOutputSchema,
  type SugestaoCampanhaOutput, type InsightOutput, type DocumentoExecutivoOutput,
} from "../domain/guardrails";
import { startOfMonth } from "date-fns";

const ORCAMENTO_MENSAL_USD = 20;
const ALERTA_70 = ORCAMENTO_MENSAL_USD * 0.7;
const ALERTA_90 = ORCAMENTO_MENSAL_USD * 0.9;

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

async function chamarOpenAI(opts: {
  orgId: string;
  modelo: (typeof MODELOS)[keyof typeof MODELOS];
  finalidade: string;
  promptVersion: string;
  mensagens: { role: "system" | "user"; content: string }[];
}): Promise<{ conteudo: string; tokensInput: number; tokensOutput: number }> {
  const consumo = await consumoMesAtual(opts.orgId);

  if (consumo >= ORCAMENTO_MENSAL_USD) {
    await emitirEvento({
      tipo: "ia.limite_consumo_atingido",
      orgId: opts.orgId,
      entidade: "llm_run",
      entidadeId: opts.orgId,
      payload: { consumoAtual: consumo, limite: ORCAMENTO_MENSAL_USD },
    });
    throw new Error("Orçamento de IA atingido. Insights pausados até o próximo ciclo.");
  }

  if (consumo >= ALERTA_90) {
    await emitirEvento({
      tipo: "ia.limite_consumo_atingido",
      orgId: opts.orgId,
      entidade: "llm_run",
      entidadeId: opts.orgId,
      payload: { consumoAtual: consumo, limite: ORCAMENTO_MENSAL_USD, alerta: "90%" },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const inicio = Date.now();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.modelo,
      messages: opts.mensagens,
      response_format: { type: "json_object" },
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
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const tokensInput = data.usage.prompt_tokens;
  const tokensOutput = data.usage.completion_tokens;
  const custoUsd = calcularCusto(opts.modelo, tokensInput, tokensOutput);

  await registrarLlmRun({ ...opts, tokensInput, tokensOutput, custoUsd, duracaoMs, sucesso: true });

  if (consumo + custoUsd >= ALERTA_70 && consumo < ALERTA_70) {
    await emitirEvento({
      tipo: "ia.limite_consumo_atingido",
      orgId: opts.orgId,
      entidade: "llm_run",
      entidadeId: opts.orgId,
      payload: { consumoAtual: consumo + custoUsd, alerta: "70%" },
    });
  }

  return { conteudo: data.choices[0].message.content, tokensInput, tokensOutput };
}

export async function gerarSugestoesCampanha(orgId: string): Promise<void> {
  const clientes_em_risco = await db
    .select({ clienteId: scoreCliente.clienteId, churnRisk: scoreCliente.churnRisk, explicacao: scoreCliente.explicacao })
    .from(scoreCliente)
    .where(and(eq(scoreCliente.orgId, orgId), gte(scoreCliente.churnRisk, 60)))
    .limit(50);

  if (clientes_em_risco.length === 0) return;

  const promptVersion = "sugestao-campanha-v1";
  const sistemaPrompt = `Você é um analista de CRM especialista em retenção.
Analise os dados de clientes em risco de churn e sugira UMA campanha de reativação.
Responda SOMENTE em JSON com: titulo, segmentoDescricao, oferta, descontoMinimo (número 0-100), justificativa.
Use apenas agregados. NÃO mencione clientes individuais.`;

  const userPrompt = `Dados agregados:
- ${clientes_em_risco.length} clientes com churn_risk ≥ 60
- Score médio: ${Math.round(clientes_em_risco.reduce((a, c) => a + c.churnRisk, 0) / clientes_em_risco.length)}
- Exemplos de explicação: ${clientes_em_risco.slice(0, 3).map((c) => c.explicacao).join(" | ")}

Sugira uma campanha de reativação concisa e objetiva.`;

  let output: SugestaoCampanhaOutput;
  try {
    const { conteudo } = await chamarOpenAI({
      orgId,
      modelo: MODELOS.triagem,
      finalidade: "sugestao_campanha",
      promptVersion,
      mensagens: [
        { role: "system", content: sistemaPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let jsonBruto: unknown;
    try {
      jsonBruto = JSON.parse(conteudo);
    } catch {
      throw new Error("Saída da IA não é JSON válido.");
    }
    const parsed = SugestaoCampanhaOutputSchema.safeParse(jsonBruto);
    if (!parsed.success) throw new Error(`Saída da IA inválida: ${parsed.error.message}`);
    output = parsed.data;
  } catch (err) {
    console.error("[ai.service] gerarSugestoesCampanha:", err);
    return;
  }

  const [nova] = await db.insert(sugestaoCampanha).values({
    orgId,
    titulo: output.titulo,
    segmentoDescricao: output.segmentoDescricao,
    oferta: output.oferta,
    descontoMinimo: output.descontoMinimo.toFixed(2),
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
}

export async function aprovarSugestao(orgId: string, sugestaoId: string, aprovadoPorId: string): Promise<void> {
  await db
    .update(sugestaoCampanha)
    .set({ status: "aprovada", aprovadoPorId, updatedAt: new Date() })
    .where(and(eq(sugestaoCampanha.id, sugestaoId), eq(sugestaoCampanha.orgId, orgId)));

  await emitirEvento({
    tipo: "ia.sugestao_aprovada",
    orgId,
    entidade: "sugestao_campanha",
    entidadeId: sugestaoId,
    payload: { aprovadoPorId },
  });
}

export async function rejeitarSugestao(orgId: string, sugestaoId: string, motivo: string): Promise<void> {
  await db
    .update(sugestaoCampanha)
    .set({ status: "rejeitada", motivoRejeicao: motivo, updatedAt: new Date() })
    .where(and(eq(sugestaoCampanha.id, sugestaoId), eq(sugestaoCampanha.orgId, orgId)));

  await emitirEvento({
    tipo: "ia.sugestao_rejeitada",
    orgId,
    entidade: "sugestao_campanha",
    entidadeId: sugestaoId,
    payload: { motivo },
  });
}

export async function gerarInsightFunil(orgId: string, dadosAgregados: Record<string, unknown>): Promise<void> {
  const promptVersion = "insight-funil-v1";
  const sistemaPrompt = `Você é um analista de negócios especialista em e-commerce brasileiro.
Analise os dados agregados de funil de vendas e gere insights executivos em português.
Responda em JSON com: titulo, conteudo, numerosFonte (objeto com métricas-chave), confianca (0-1).
Cada afirmação no conteudo deve citar um número de numerosFonte.
NÃO invente dados. Use apenas o que foi fornecido.`;

  const userPrompt = `Dados do funil (últimos 30 dias):\n${JSON.stringify(dadosAgregados, null, 2)}`;

  let output: InsightOutput;
  try {
    const { conteudo } = await chamarOpenAI({
      orgId,
      modelo: MODELOS.insight,
      finalidade: "insight_funil",
      promptVersion,
      mensagens: [
        { role: "system", content: sistemaPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const parsed = InsightOutputSchema.safeParse(JSON.parse(conteudo));
    if (!parsed.success) throw new Error("Saída de insight inválida.");
    output = parsed.data;
  } catch (err) {
    console.error("[ai.service] gerarInsightFunil:", err);
    return;
  }

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

  const { conteudo } = await chamarOpenAI({
    orgId,
    modelo: MODELOS.insight,
    finalidade: "documento_executivo",
    promptVersion,
    mensagens: [
      { role: "system", content: sistemaPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = DocumentoExecutivoOutputSchema.safeParse(JSON.parse(conteudo));
  if (!parsed.success) throw new Error("Saída do documento executivo inválida.");
  const output = parsed.data;

  return output;
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
  const inicio = startOfMonth(new Date());
  const resultado = await db
    .select({ total: sum(llmRun.custoUsd) })
    .from(llmRun)
    .where(and(eq(llmRun.orgId, orgId), gte(llmRun.createdAt, inicio)));

  const consumoAtual = parseFloat(resultado[0]?.total ?? "0");
  return {
    consumoAtualUsd: consumoAtual,
    orcamentoUsd: ORCAMENTO_MENSAL_USD,
    percentual: Math.round((consumoAtual / ORCAMENTO_MENSAL_USD) * 100),
    alerta: consumoAtual >= ALERTA_90 ? "90%" : consumoAtual >= ALERTA_70 ? "70%" : null,
  };
}
