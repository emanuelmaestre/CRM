type ClientePDF = {
  cliente: { nome: string; nomeCompleto?: string | null; email?: string | null; telefone?: string | null };
  resumoComercial: {
    totalPedidos: number; totalGasto: number; ticketMedio: number;
    primeiroPedidoEm: Date | string | null; ultimoPedidoEm: Date | string | null;
    cancelados: number; devolvidos: number;
    marcaPreferida: { nome: string } | null;
    canalPreferido: { canal: string } | null;
    produtosMaisComprados: Array<{ nome: string; quantidade: number }>;
  };
  classificacaoRelacionamento: { label: string; motivo: string };
  pedidos: Array<{ providerOrderId?: string | null; canal: string; status: string; total: string; createdAt: Date | string }>;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = (valor: Date | string | null) => valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";

/** Relatório operacional do cliente. Não é exportação de dado cru: o PDF
 * reproduz a leitura comercial disponível na ficha 360º. */
export async function exportarClientePDF(info: ClientePDF) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const nome = info.cliente.nomeCompleto?.trim() || info.cliente.nome;

  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text("Ficha comercial do cliente", 14, 20);
  doc.setFontSize(12);
  doc.text(nome, 14, 29);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 35);

  autoTable(doc, {
    startY: 43,
    head: [["Indicador", "Valor"]],
    body: [
      ["Classificação", `${info.classificacaoRelacionamento.label} — ${info.classificacaoRelacionamento.motivo}`],
      ["Total comprado", moeda.format(info.resumoComercial.totalGasto)],
      ["Pedidos", String(info.resumoComercial.totalPedidos)],
      ["Ticket médio", moeda.format(info.resumoComercial.ticketMedio)],
      ["Primeira compra", data(info.resumoComercial.primeiroPedidoEm)],
      ["Última compra", data(info.resumoComercial.ultimoPedidoEm)],
      ["Marca preferida", info.resumoComercial.marcaPreferida?.nome ?? "—"],
      ["Canal preferido", info.resumoComercial.canalPreferido?.canal ?? "—"],
      ["Cancelamentos / devoluções", `${info.resumoComercial.cancelados} / ${info.resumoComercial.devolvidos}`],
    ],
    headStyles: { fillColor: [155, 48, 217] },
    styles: { fontSize: 9 },
  });

  const yProdutos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (info.resumoComercial.produtosMaisComprados.length) {
    autoTable(doc, {
      startY: yProdutos,
      head: [["Produtos mais comprados", "Quantidade"]],
      body: info.resumoComercial.produtosMaisComprados.map((item) => [item.nome, String(item.quantidade)]),
      headStyles: { fillColor: [73, 80, 87] },
    });
  }

  const yPedidos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: yPedidos,
    head: [["Pedido", "Data", "Canal", "Status", "Total"]],
    body: info.pedidos.map((item) => [item.providerOrderId ?? item.status, data(item.createdAt), item.canal, item.status, moeda.format(Number(item.total))]),
    headStyles: { fillColor: [73, 80, 87] },
    styles: { fontSize: 8 },
  });

  doc.save(`cliente-${nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}
