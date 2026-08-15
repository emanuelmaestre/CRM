import metricasConfig from "@/config/metricas.json";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";

const copy = metricasConfig.exportacao;

/* ── Exportação em PDF ───────────────────────────────────────────
   Só PDF: é o formato em que a leitura fechada de um período é levada
   para uma reunião ou arquivada. Planilha faria sentido para dado cru,
   e o dado cru aqui já mora no Painel e no Estoque.

   `jspdf` e `jspdf-autotable` entram por import dinâmico — juntos passam
   de 300 KB, e ninguém deveria pagar isso ao abrir a página só para ler
   os números na tela. O custo só existe para quem clica em exportar. */

/** O PDF repete a ordem da tela de propósito: quem exporta reconhece o
 *  documento como a mesma leitura, não como um relatório paralelo. */
export async function exportarMetricasPDF(
  saude: SaudeLojaResultado,
  atendimento: AtendimentoResumo | null,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const agora = new Date();
  const hoje = agora.toLocaleDateString("pt-BR");
  const margem = 14;

  /* Cabeçalho */
  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text(copy.titulo, margem, 20);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${copy.periodoLabel}: ${saude.periodoLabel}  ·  ${copy.geradoEm}: ${hoje}`,
    margem,
    27,
  );

  /* Score consolidado em destaque — é o número que a página inteira resume. */
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(copy.scoreTitulo, margem, 38);

  doc.setFontSize(28);
  doc.setTextColor(...corDaFaixa(saude.faixaGeralCor));
  doc.text(saude.scoreGeral === null ? "—" : String(saude.scoreGeral), margem, 50);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${saude.faixaGeralLabel ?? copy.semDado} · ${copy.scoreConsolidado}`,
    margem + (saude.scoreGeral === null ? 8 : 20),
    50,
  );

  let y = 60;

  /* Comparação marca a marca */
  y = secao(doc, copy.comparacaoTitulo, y);
  autoTable(doc, {
    startY: y,
    head: [copy.comparacaoColunas],
    body: saude.marcas.map((marca) => [
      marca.marcaLabel,
      marca.score === null ? "—" : String(marca.score),
      marca.faturamentoLabel,
      String(marca.pedidos),
      marca.ticketMedioLabel,
      marca.notaMedia === null ? "—" : `${marca.notaMedia.toFixed(1)}`,
      marca.emMediacao > 0
        ? `${marca.reclamacoesAbertas} (${marca.emMediacao} em mediação)`
        : String(marca.reclamacoesAbertas),
      marca.margemPercentual === null ? "—" : `${marca.margemPercentual}% (cob. ${marca.margemCoberturaPercentual}%)`,
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [155, 48, 217], fontSize: 8.5 },
  });
  y = depoisDaTabela(doc);

  /* Crescimento e risco — tabela própria, não colada na de cima: 11 colunas
     numa A4 portrait ficariam ilegíveis de tão espremidas. */
  y = secao(doc, copy.crescimentoTitulo, y);
  autoTable(doc, {
    startY: y,
    head: [copy.crescimentoColunas],
    body: saude.marcas.map((marca) => [
      marca.marcaLabel,
      marca.taxaCancelamento === null ? "—" : `${marca.taxaCancelamento}%`,
      marca.concentracaoTop5 === null ? "—" : `${marca.concentracaoTop5}%`,
      marca.taxaRecorrencia === null ? "—" : `${marca.taxaRecorrencia}%`,
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], fontSize: 8.5 },
  });
  y = depoisDaTabela(doc);

  /* Reputação — só as marcas que de fato têm termômetro. */
  const comReputacao = saude.marcas.filter((marca) => marca.reputacao !== null);
  if (comReputacao.length > 0) {
    y = secao(doc, copy.reputacaoTitulo, y);
    autoTable(doc, {
      startY: y,
      head: [copy.reputacaoColunas],
      body: comReputacao.map((marca) => {
        const reputacao = marca.reputacao!;
        const taxa = (chave: string) => {
          const encontrada = reputacao.taxas.find((item) => item.chave === chave);
          if (!encontrada || encontrada.valor === null) return "—";
          // O teto viaja junto com o valor: "1,2% (lim. 2%)" se lê sozinho,
          // fora da tela que tinha o risco desenhado na barra.
          return `${encontrada.valor}% (lim. ${encontrada.limite}%)`;
        };
        return [
          marca.marcaLabel,
          reputacao.faixaLabel ?? copy.semDado,
          taxa("reclamacao"),
          taxa("cancelamento"),
          taxa("atrasoEnvio"),
          reputacao.vendasConcluidas === null ? "—" : String(reputacao.vendasConcluidas),
        ];
      }),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [31, 138, 76], fontSize: 8.5 },
    });
    y = depoisDaTabela(doc);
  }

  /* Pilares — o "porquê" do score, marca por marca. */
  y = secao(doc, copy.pilaresTitulo, y);
  autoTable(doc, {
    startY: y,
    head: [copy.pilaresColunas],
    body: saude.marcas.flatMap((marca) =>
      marca.pilares.map((pilar) => [
        marca.marcaLabel,
        pilar.label,
        String(pilar.peso),
        pilar.nota === null ? "—" : String(Math.round(pilar.nota)),
        pilar.detalhe,
      ]),
    ),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
    columnStyles: { 4: { cellWidth: 62 } },
  });
  y = depoisDaTabela(doc);

  /* Funil de atendimento */
  if (atendimento && atendimento.perguntas > 0) {
    y = secao(doc, copy.atendimentoTitulo, y);
    doc.setFontSize(8.5);
    doc.setTextColor(120);
    doc.text(
      copy.atendimentoResumo
        .replace("{perguntas}", String(atendimento.perguntas))
        .replace("{taxa}", String(atendimento.taxaResposta ?? 0))
        .replace("{mediana}", atendimento.medianaLabel ?? copy.semDado),
      margem,
      y,
    );
    autoTable(doc, {
      startY: y + 4,
      head: [copy.atendimentoColunas],
      body: atendimento.faixas.map((faixa) => [
        faixa.label,
        String(faixa.quantidade),
        `${faixa.participacao}%`,
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [155, 48, 217], fontSize: 8.5 },
    });
    y = depoisDaTabela(doc);

    // Quebra por canal só quando há mais de um — com um canal só ela repetiria
    // a linha de resumo de cima sem acrescentar nada.
    if (atendimento.porCanal.length > 1) {
      y = secao(doc, copy.atendimentoPorCanalTitulo, y);
      autoTable(doc, {
        startY: y,
        head: [copy.atendimentoPorCanalColunas],
        body: atendimento.porCanal.map((canal) => [
          canal.canal,
          String(canal.perguntas),
          canal.taxaResposta === null ? "—" : `${canal.taxaResposta}%`,
          canal.medianaLabel ?? copy.semDado,
        ]),
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [155, 48, 217], fontSize: 8.5 },
      });
      y = depoisDaTabela(doc);
    }
  }

  /* A nota de rodapé não é enfeite: sem ela, um score de 74 calculado sobre
     3 pilares parece igual a um calculado sobre 5. */
  doc.setFontSize(7.5);
  doc.setTextColor(140);
  doc.text(doc.splitTextToSize(copy.rodape, 180), margem, Math.min(y + 2, 285));

  doc.save(`${copy.arquivo}-${agora.toISOString().slice(0, 10)}.pdf`);
}

/** Só o tipo — o módulo em si continua entrando por import dinâmico. */
type Doc = import("jspdf").jsPDF;

/** Título de seção; quebra página quando não sobra espaço para a tabela vir junto. */
function secao(doc: Doc, titulo: string, y: number): number {
  let posicao = y;
  if (posicao > 250) {
    doc.addPage();
    posicao = 20;
  }
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(titulo, 14, posicao);
  return posicao + 5;
}

function depoisDaTabela(doc: Doc): number {
  const final = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return (final ?? 60) + 10;
}

/** "#1F8A4C" → [31, 138, 76]. Cinza quando não há faixa (score indisponível). */
function corDaFaixa(hex: string | null): [number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return [110, 110, 110];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
