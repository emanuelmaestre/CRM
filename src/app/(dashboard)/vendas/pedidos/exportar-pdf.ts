type PedidoPdf = {
  providerOrderId: string | null;
  id: string;
  clienteNome: string;
  brandNome: string;
  canal: string;
  status: string;
  total: string;
  createdAt: Date | string;
};

type ResumoPdf = {
  totalPedidos: number;
  faturamento: number;
  ticketMedio: number;
  cancelados: number;
  freteTotal: number;
  descontosTotal: number;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

// Mesma cor da marca (--selecionado / gradient-signature) usada no PDF da
// ficha de cliente — os dois relatórios do produto precisam parecer irmãos.
const ROXO: [number, number, number] = [155, 48, 217];
const CINZA_ESCURO: [number, number, number] = [45, 47, 56];
const LARGURA_PAGINA = 297; // A4 paisagem
const MARGEM = 14;

const STATUS_LABEL: Record<string, string> = {
  criado: "Criado", pago: "Pago", separado: "Separado", enviado: "Enviado",
  entregue: "Entregue", avaliacao_solicitada: "Avaliação solicitada",
  concluido: "Concluído", cancelado: "Cancelado", devolvido: "Devolvido",
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replaceAll("_", " ");
}

export async function exportarPedidosPdf(input: {
  pedidos: PedidoPdf[];
  resumo: ResumoPdf;
  total: number;
  periodo: { inicio: string; fim: string };
}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const gerar = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const periodoLabel = input.periodo.inicio || input.periodo.fim
    ? `${input.periodo.inicio ? data.format(new Date(`${input.periodo.inicio}T12:00:00`)) : "início"} até ${input.periodo.fim ? data.format(new Date(`${input.periodo.fim}T12:00:00`)) : "hoje"}`
    : "Todo o período selecionado";

  // ── Cabeçalho ────────────────────────────────────────────────
  doc.setFillColor(...ROXO);
  doc.rect(0, 0, LARGURA_PAGINA, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("RELATÓRIO DE VENDAS", MARGEM, 11);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(periodoLabel, MARGEM, 19);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, LARGURA_PAGINA - MARGEM, 19, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ── Resumo do período ────────────────────────────────────────
  autoTable(doc, {
    startY: 34,
    theme: "grid",
    body: [[
      "Faturamento", moeda.format(input.resumo.faturamento),
      "Pedidos", input.resumo.totalPedidos.toLocaleString("pt-BR"),
      "Valor médio por pedido", moeda.format(input.resumo.ticketMedio),
      "Cancel. / devol.", input.resumo.cancelados.toLocaleString("pt-BR"),
      "Frete", moeda.format(input.resumo.freteTotal),
      "Descontos", moeda.format(input.resumo.descontosTotal),
    ]],
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    columnStyles: Object.fromEntries(
      [0, 2, 4, 6, 8, 10].map((coluna) => [coluna, { fontStyle: "bold" as const, textColor: CINZA_ESCURO }]),
    ),
  });

  const yResumo = gerar() + 8;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Exibindo ${input.pedidos.length} de ${input.total} pedidos — o PDF respeita os filtros aplicados na tela.`, MARGEM, yResumo);
  doc.setTextColor(0, 0, 0);

  // ── Pedidos ──────────────────────────────────────────────────
  autoTable(doc, {
    startY: yResumo + 4,
    head: [["Pedido", "Data", "Cliente", "Marca", "Canal", "Status", "Total"]],
    body: input.pedidos.map((pedido) => [
      `#${pedido.providerOrderId ?? pedido.id.slice(0, 8)}`,
      data.format(new Date(pedido.createdAt)),
      pedido.clienteNome,
      pedido.brandNome,
      pedido.canal,
      statusLabel(pedido.status),
      moeda.format(Number(pedido.total)),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: CINZA_ESCURO, fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 246, 251] },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 24 }, 6: { halign: "right" } },
  });

  // ── Rodapé ───────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    doc.text(`Página ${pagina} de ${paginas}`, LARGURA_PAGINA - MARGEM, 205, { align: "right" });
  }

  doc.save(`vendas-${new Date().toISOString().slice(0, 10)}.pdf`);
}
