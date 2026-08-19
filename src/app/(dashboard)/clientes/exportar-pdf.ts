type ClientePDF = {
  cliente: {
    nome: string; nomeCompleto?: string | null; email?: string | null; telefone?: string | null;
    enderecoRua?: string | null; enderecoNumero?: string | null; enderecoComplemento?: string | null;
    enderecoBairro?: string | null; enderecoCidade?: string | null; enderecoEstado?: string | null;
    enderecoCep?: string | null;
  };
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
const data = (valor: Date | string | null) => valor ? new Date(valor).toLocaleDateString("pt-BR") : "Sem data";

// Roxo da marca (--selecionado / gradient-signature), consistente com o resto
// do produto — o PDF não deveria parecer um documento gerado por outra
// ferramenta.
const ROXO: [number, number, number] = [155, 48, 217];
const CINZA_ESCURO: [number, number, number] = [45, 47, 56];
const LARGURA_PAGINA = 210;
const MARGEM = 14;

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    criado: "Criado", pago: "Pago", separado: "Separado", enviado: "Enviado",
    entregue: "Entregue", avaliacao_solicitada: "Avaliação solicitada",
    concluido: "Concluído", cancelado: "Cancelado", devolvido: "Devolvido",
  };
  return labels[status] ?? status;
}

function enderecoCompleto(c: ClientePDF["cliente"]): string | null {
  const linha1 = [c.enderecoRua, c.enderecoNumero].filter(Boolean).join(", ");
  const linha2 = [c.enderecoBairro, c.enderecoCidade, c.enderecoEstado].filter(Boolean).join(" — ");
  const partes = [linha1, linha2, c.enderecoCep].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Relatório operacional do cliente. Não é exportação de dado cru: o PDF
 *  reproduz a leitura comercial disponível na ficha 360º, com a mesma
 *  hierarquia visual — título com a cor da marca, seções separadas em vez de
 *  três tabelas soltas uma embaixo da outra sem contexto entre elas. */
export async function exportarClientePDF(info: ClientePDF) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const nome = info.cliente.nomeCompleto?.trim() || info.cliente.nome;
  const gerar = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Cabeçalho ────────────────────────────────────────────────
  doc.setFillColor(...ROXO);
  doc.rect(0, 0, LARGURA_PAGINA, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("FICHA COMERCIAL DO CLIENTE", MARGEM, 12);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text(nome, MARGEM, 22);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const contato = [info.cliente.email, info.cliente.telefone].filter(Boolean).join("  ·  ");
  doc.text(contato || " ", MARGEM, 28);
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, LARGURA_PAGINA - MARGEM, 28, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ── Perfil comercial ─────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...CINZA_ESCURO);
  doc.text("Perfil comercial", MARGEM, 42);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  const classificacao = `${info.classificacaoRelacionamento.label} — ${info.classificacaoRelacionamento.motivo}`;
  doc.text(doc.splitTextToSize(classificacao, LARGURA_PAGINA - MARGEM * 2), MARGEM, 48);

  autoTable(doc, {
    startY: 55,
    theme: "grid",
    body: [
      ["Total comprado", moeda.format(info.resumoComercial.totalGasto), "Pedidos", String(info.resumoComercial.totalPedidos)],
      ["Ticket médio", moeda.format(info.resumoComercial.ticketMedio), "Primeira compra", data(info.resumoComercial.primeiroPedidoEm)],
      ["Última compra", data(info.resumoComercial.ultimoPedidoEm), "Marca preferida", info.resumoComercial.marcaPreferida?.nome ?? "Sem preferência"],
      ["Canal preferido", info.resumoComercial.canalPreferido?.canal ?? "Sem preferência", "Cancel. / devol.", `${info.resumoComercial.cancelados} / ${info.resumoComercial.devolvidos}`],
    ],
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: CINZA_ESCURO, cellWidth: 42 },
      1: { cellWidth: 56 },
      2: { fontStyle: "bold", textColor: CINZA_ESCURO, cellWidth: 42 },
      3: { cellWidth: 42 },
    },
  });

  // ── Endereço de entrega ──────────────────────────────────────
  const endereco = enderecoCompleto(info.cliente);
  let y = gerar() + 10;
  if (endereco) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...CINZA_ESCURO);
    doc.text("Endereço de entrega", MARGEM, y);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(doc.splitTextToSize(endereco, LARGURA_PAGINA - MARGEM * 2), MARGEM, y + 6);
    if (info.cliente.enderecoComplemento?.trim()) {
      doc.setTextColor(140);
      doc.text(doc.splitTextToSize(`Complemento: ${info.cliente.enderecoComplemento.trim()}`, LARGURA_PAGINA - MARGEM * 2), MARGEM, y + 12);
      y += 6;
    }
    y += 14;
  }

  // ── Produtos mais comprados ──────────────────────────────────
  if (info.resumoComercial.produtosMaisComprados.length) {
    autoTable(doc, {
      startY: y,
      head: [["Produtos mais comprados", "Quantidade"]],
      body: info.resumoComercial.produtosMaisComprados.map((item) => [item.nome, String(item.quantidade)]),
      headStyles: { fillColor: ROXO, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 246, 251] },
      columnStyles: { 1: { halign: "right", cellWidth: 30 } },
    });
    y = gerar() + 10;
  }

  // ── Histórico de pedidos ─────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["Pedido", "Data", "Canal", "Status", "Total"]],
    body: info.pedidos.map((item) => [
      item.providerOrderId ?? "Sem número", data(item.createdAt), item.canal, statusLabel(item.status), moeda.format(Number(item.total)),
    ]),
    headStyles: { fillColor: CINZA_ESCURO, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: { 4: { halign: "right" } },
  });

  // ── Rodapé ───────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    doc.text(`Página ${pagina} de ${paginas}`, LARGURA_PAGINA - MARGEM, 290, { align: "right" });
  }

  doc.save(`cliente-${nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}
