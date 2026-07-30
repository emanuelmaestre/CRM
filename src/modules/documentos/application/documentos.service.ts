import { eq, and, desc } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { documentoGerado } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { gerarDocumentoExecutivo } from "@/modules/ai/application/ai.service";
import type { CrudContext } from "@/shared/lib/crud-factory";
import type { DocumentoExecutivoOutput } from "@/modules/ai/domain/guardrails";

export type TipoDocumento = "relatorio_executivo" | "proposta" | "minuta";

export interface DadosProposta {
  titulo: string;
  clienteNome: string;
  marcaNome: string;
  valor: number | null;
  responsavelNome: string | null;
  validadeDias: number;
  condicoesPagamento: string;
}

export interface SolicitacaoDocumento {
  tipo: TipoDocumento;
  formato?: "pdf" | "docx";
  periodo: string;
  dadosKpis?: {
    receitaTotal: number;
    totalPedidos: number;
    canaisAtivos: number;
    clientesEmRisco: number;
    sugestoesPendentes: number;
  };
  dadosProposta?: DadosProposta;
}

// Conteúdo determinístico (sem IA) — proposta é documento comercial com
// implicação de preço/condições para o cliente, então usa só os dados reais
// da oportunidade, sem geração probabilística.
function montarConteudoProposta(dados: DadosProposta, periodo: string) {
  const validoAte = new Date(Date.now() + dados.validadeDias * 86_400_000);
  return {
    titulo: `Proposta comercial — ${dados.titulo}`,
    resumo: `Proposta para ${dados.clienteNome} (${dados.marcaNome})` +
      (dados.valor != null ? `, no valor de R$ ${dados.valor.toFixed(2)}` : "") + ".",
    destaques: [
      `Cliente: ${dados.clienteNome}`,
      `Marca: ${dados.marcaNome}`,
      dados.valor != null ? `Valor proposto: R$ ${dados.valor.toFixed(2)}` : "Valor a definir",
      dados.responsavelNome ? `Responsável: ${dados.responsavelNome}` : null,
    ].filter((item): item is string => item !== null),
    alertas: [] as string[],
    recomendacoes: [
      `Condições de pagamento: ${dados.condicoesPagamento}`,
      `Proposta válida até ${validoAte.toLocaleDateString("pt-BR")} (${dados.validadeDias} dias).`,
    ],
    periodo,
  };
}

async function renderizarDocx(
  tipo: TipoDocumento,
  periodo: string,
  conteudo: DocumentoExecutivoOutput | Record<string, unknown>,
): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const titulo = "titulo" in conteudo ? String(conteudo.titulo) : `Documento — ${tipo}`;
  const secoes: Array<{ titulo: string; itens: string[] }> = [
    { titulo: "Destaques", itens: "destaques" in conteudo && Array.isArray(conteudo.destaques) ? conteudo.destaques.map(String) : [] },
    { titulo: "Alertas", itens: "alertas" in conteudo && Array.isArray(conteudo.alertas) ? conteudo.alertas.map(String) : [] },
    { titulo: "Recomendações", itens: "recomendacoes" in conteudo && Array.isArray(conteudo.recomendacoes) ? conteudo.recomendacoes.map(String) : [] },
  ];
  const children = [
    new Paragraph({ text: titulo, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Período: ${periodo}` }),
    new Paragraph({ text: "resumo" in conteudo ? String(conteudo.resumo) : JSON.stringify(conteudo) }),
    ...secoes.flatMap((secao) => secao.itens.length === 0 ? [] : [
      new Paragraph({ text: secao.titulo, heading: HeadingLevel.HEADING_1 }),
      ...secao.itens.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })),
    ]),
    new Paragraph({ text: "Resultado probabilístico; a decisão final é do gestor." }),
  ];
  const arquivo = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(arquivo));
}

// Gera bytes de PDF usando jsPDF (server-safe: sem DOM)
async function renderizarPdf(
  tipo: TipoDocumento,
  periodo: string,
  conteudo: DocumentoExecutivoOutput | Record<string, unknown>,
): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;

  // Cabeçalho
  doc.setFillColor(14, 15, 19);
  doc.rect(0, 0, pageW, 24, "F");
  doc.setTextColor(242, 243, 245);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CRM LEO — Sinal Duplo", margin, 15);

  // Título
  doc.setTextColor(21, 23, 28);
  doc.setFontSize(18);
  const titulo = "titulo" in conteudo ? String(conteudo.titulo) : `Relatório — ${tipo}`;
  doc.text(titulo, margin, 38, { maxWidth: contentW });

  doc.setFontSize(10);
  doc.setTextColor(90, 95, 106);
  doc.setFont("helvetica", "normal");
  doc.text(`Período: ${periodo}`, margin, 46);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}`, margin, 51);

  // Linha separadora
  doc.setDrawColor(230, 231, 234);
  doc.setLineWidth(0.3);
  doc.line(margin, 55, pageW - margin, 55);

  let y = 63;

  // Resumo
  if ("resumo" in conteudo && conteudo.resumo) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 23, 28);
    doc.text("Resumo Executivo", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 95, 106);
    const linhasResumo = doc.splitTextToSize(String(conteudo.resumo), contentW);
    doc.text(linhasResumo, margin, y);
    y += linhasResumo.length * 5 + 6;
  }

  // Destaques
  const destaques = "destaques" in conteudo && Array.isArray(conteudo.destaques) ? conteudo.destaques as string[] : [];
  if (destaques.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 138, 76);
    doc.text("✓ Destaques", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const d of destaques) {
      doc.setTextColor(21, 23, 28);
      const linhas = doc.splitTextToSize(`• ${d}`, contentW - 4);
      doc.text(linhas, margin + 2, y);
      y += linhas.length * 5 + 2;
    }
    y += 4;
  }

  // Alertas
  const alertas = "alertas" in conteudo && Array.isArray(conteudo.alertas) ? conteudo.alertas as string[] : [];
  if (alertas.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(181, 122, 0);
    doc.text("⚠ Alertas", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const a of alertas) {
      doc.setTextColor(21, 23, 28);
      const linhas = doc.splitTextToSize(`• ${a}`, contentW - 4);
      doc.text(linhas, margin + 2, y);
      y += linhas.length * 5 + 2;
    }
    y += 4;
  }

  // Recomendações
  const recomendacoes = "recomendacoes" in conteudo && Array.isArray(conteudo.recomendacoes) ? conteudo.recomendacoes as string[] : [];
  if (recomendacoes.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text("→ Recomendações", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const r of recomendacoes) {
      doc.setTextColor(21, 23, 28);
      const linhas = doc.splitTextToSize(`${r}`, contentW - 4);
      doc.text(linhas, margin + 2, y);
      y += linhas.length * 5 + 2;
    }
  }

  // Rodapé
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(154, 160, 172);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Gerado pelo CRM LEO · Resultado probabilístico — decisão é do gestor (Cláusula 11.3)",
    margin,
    pageH - 10,
    { maxWidth: contentW },
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

export async function gerarDocumento(
  ctx: CrudContext,
  solicitacao: SolicitacaoDocumento,
): Promise<{ documentoId: string; nomeArquivo: string; storageUrl: string; conteudo: Record<string, unknown> }> {
  const formato = solicitacao.formato ?? "pdf";
  const nomeArquivo = `${solicitacao.tipo}-${new Date().toISOString().slice(0, 10)}.${formato}`;

  let conteudo: DocumentoExecutivoOutput | Record<string, unknown>;

  if (solicitacao.tipo === "relatorio_executivo" && solicitacao.dadosKpis) {
    conteudo = await gerarDocumentoExecutivo(
      ctx.orgId,
      { ...solicitacao.dadosKpis, periodo: solicitacao.periodo },
    );
  } else if (solicitacao.tipo === "proposta" && solicitacao.dadosProposta) {
    conteudo = montarConteudoProposta(solicitacao.dadosProposta, solicitacao.periodo);
  } else {
    conteudo = { tipo: solicitacao.tipo, periodo: solicitacao.periodo, geradoEm: new Date().toISOString() };
  }

  const arquivoBytes = formato === "docx"
    ? await renderizarDocx(solicitacao.tipo, solicitacao.periodo, conteudo)
    : await renderizarPdf(solicitacao.tipo, solicitacao.periodo, conteudo);

  // Salva o PDF no Supabase Storage (bucket "documentos", path orgId/nome)
  let storageUrl: string | null = null;
  try {
    const { createClient } = await import("@/shared/lib/supabase/server");
    const supabase = await createClient();
    const storagePath = `${ctx.orgId}/${nomeArquivo}`;
    const { error } = await supabase.storage
      .from("documentos")
      .upload(storagePath, arquivoBytes, {
        contentType: formato === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
        upsert: true,
      });
    if (error) throw new Error(`Falha ao armazenar documento: ${error.message}`);
    const { data: signed, error: signedError } = await supabase.storage
      .from("documentos")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signedError || !signed?.signedUrl) throw new Error("Não foi possível assinar a URL do documento.");
    storageUrl = signed.signedUrl;
  } catch (erro) {
    throw erro instanceof Error ? erro : new Error("Falha ao persistir documento.");
  }

  const [doc] = await db
    .insert(documentoGerado)
    .values({
      orgId: ctx.orgId,
      tipo: solicitacao.tipo,
      nomeArquivo,
      dadosOrigem: { solicitacao, conteudo } as unknown as Record<string, unknown>,
      geradoPorId: ctx.userId ?? undefined,
      storageUrl,
    })
    .returning();

  await emitirEvento({
    tipo: "documento.gerado",
    orgId: ctx.orgId,
    entidade: "documento_gerado",
    entidadeId: doc.id,
    payload: { tipo: solicitacao.tipo, nomeArquivo, storageUrl },
  });

  return { documentoId: doc.id, nomeArquivo, storageUrl, conteudo: conteudo as Record<string, unknown> };
}

export async function listarDocumentos(orgId: string, limite = 10) {
  return db
    .select()
    .from(documentoGerado)
    .where(eq(documentoGerado.orgId, orgId))
    .orderBy(desc(documentoGerado.createdAt))
    .limit(limite);
}

export async function buscarDocumento(orgId: string, documentoId: string) {
  return db
    .select()
    .from(documentoGerado)
    .where(and(eq(documentoGerado.id, documentoId), eq(documentoGerado.orgId, orgId)))
    .then((r) => r[0] ?? null);
}
