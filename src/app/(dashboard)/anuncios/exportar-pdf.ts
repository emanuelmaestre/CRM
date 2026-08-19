import type { VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percentual = (valor: number | null) => valor === null ? "Sem dado" : `${valor.toFixed(1)}%`;

/** Relatório executivo somente em PDF. O import dinâmico mantém jsPDF fora do
 * bundle inicial da página e o documento usa exatamente o recorte visível. */
export async function exportarAnunciosPDF(marca: VisaoGeralMarca, periodo: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margem = 14;

  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text("Desempenho de Anúncios", margem, 18);
  doc.setFontSize(10);
  doc.setTextColor(105);
  doc.text(`${marca.brandLabel} · ${periodo} · Gerado em ${new Date().toLocaleDateString("pt-BR")}`, margem, 25);

  autoTable(doc, {
    startY: 33,
    head: [["Investimento", "Receita Ads", "Receita orgânica", "ROAS", "ACOS", "TACOS", "Impressões", "Cliques", "Vendas"]],
    body: [[
      moeda.format(marca.resumo.investimentoTotal), moeda.format(marca.resumo.receitaTotal),
      moeda.format(marca.resumo.receitaOrganica), marca.resumo.roasMedio?.toFixed(2) ?? "Sem dado",
      percentual(marca.resumo.acosMedio), percentual(marca.resumo.tacos),
      marca.resumo.impressoes.toLocaleString("pt-BR"), marca.resumo.cliques.toLocaleString("pt-BR"),
      marca.resumo.vendas.toLocaleString("pt-BR"),
    ]],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [125, 65, 170] },
  });

  const y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 50) + 10;
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("Campanhas", margem, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Campanha", "Status", "Criada em", "Investido", "Receita", "ROAS", "ACOS", "CTR", "CVR", "Imp. share", "Perda orçamento", "Perda ranking"]],
    body: marca.campanhas.map((campanha) => [
      campanha.nome, campanha.status, campanha.criadaEm ? new Date(campanha.criadaEm).toLocaleDateString("pt-BR") : "Não informada", moeda.format(campanha.investimento), moeda.format(campanha.receita),
      campanha.roas?.toFixed(2) ?? "Sem dado", percentual(campanha.acos), percentual(campanha.ctr),
      percentual(campanha.cvr), percentual(campanha.impressionShare),
      percentual(campanha.lostImpressionShareByBudget), percentual(campanha.lostImpressionShareByAdRank),
    ]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], fontSize: 7.5 },
  });

  doc.setFontSize(7.5);
  doc.setTextColor(125);
  doc.text("Dados de leitura do Mercado Ads.", margem, 196);
  doc.save(`anuncios-${marca.brandSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
