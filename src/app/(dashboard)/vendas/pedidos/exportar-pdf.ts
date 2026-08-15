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

export async function exportarPedidosPdf(input: {
  pedidos: PedidoPdf[];
  resumo: ResumoPdf;
  total: number;
  periodo: { inicio: string; fim: string };
}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Relatório de vendas", 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const periodo = input.periodo.inicio || input.periodo.fim
    ? `${input.periodo.inicio ? data.format(new Date(`${input.periodo.inicio}T12:00:00`)) : "início"} até ${input.periodo.fim ? data.format(new Date(`${input.periodo.fim}T12:00:00`)) : "hoje"}`
    : "Todo o período selecionado";
  doc.text(`${periodo} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["Faturamento", "Pedidos", "Ticket médio", "Cancelados/devolvidos", "Frete", "Descontos"]],
    body: [[
      moeda.format(input.resumo.faturamento),
      input.resumo.totalPedidos.toLocaleString("pt-BR"),
      moeda.format(input.resumo.ticketMedio),
      input.resumo.cancelados.toLocaleString("pt-BR"),
      moeda.format(input.resumo.freteTotal),
      moeda.format(input.resumo.descontosTotal),
    ]],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [44, 44, 52] },
  });

  const finalY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48;
  doc.setFontSize(8);
  doc.text(`Exibindo ${input.pedidos.length} de ${input.total} pedidos. O PDF respeita os filtros aplicados na tela.`, 14, finalY + 7);

  autoTable(doc, {
    startY: finalY + 11,
    head: [["Pedido", "Data", "Cliente", "Marca", "Canal", "Status", "Total"]],
    body: input.pedidos.map((pedido) => [
      `#${pedido.providerOrderId ?? pedido.id.slice(0, 8)}`,
      data.format(new Date(pedido.createdAt)),
      pedido.clienteNome,
      pedido.brandNome,
      pedido.canal,
      pedido.status.replaceAll("_", " "),
      moeda.format(Number(pedido.total)),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [44, 44, 52] },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 24 }, 6: { halign: "right" } },
  });

  doc.save(`vendas-${new Date().toISOString().slice(0, 10)}.pdf`);
}
