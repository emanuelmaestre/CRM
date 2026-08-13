import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import {
  scoreCliente, scoreProduto, scoreHistorico, pedido, pedidoItem,
  estoqueCanalSaldo, produto,
} from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { calcularScoreCliente } from "../domain/rfm";
import { calcularScoreProduto } from "../domain/encalhe";
import { addDays } from "date-fns";

export async function recalcularScoreCliente(orgId: string, clienteId: string): Promise<void> {
  const pedidos = await db
    .select()
    .from(pedido)
    .where(and(eq(pedido.orgId, orgId), eq(pedido.clienteId, clienteId), eq(pedido.status, "concluido")))
    .orderBy(desc(pedido.createdAt));

  if (pedidos.length === 0) {
    const semCompraSegmento = "Em risco";
    const semCompraAcao = "Sem histórico de compras — priorizar primeiro contato comercial";
    await db
      .insert(scoreCliente)
      .values({
        orgId, clienteId,
        churnRisk: 50, rfmRecencia: 0, rfmFrequencia: 0,
        segmento: semCompraSegmento, acaoSugerida: semCompraAcao, probabilidadeRecompra30d: 50,
        explicacao: "Sem compras concluídas ainda.", versaoFormula: "v2",
      })
      .onConflictDoUpdate({
        target: scoreCliente.clienteId,
        set: {
          churnRisk: 50, rfmRecencia: 0, rfmFrequencia: 0,
          segmento: semCompraSegmento, acaoSugerida: semCompraAcao, probabilidadeRecompra30d: 50,
          explicacao: "Sem compras concluídas ainda.", versaoFormula: "v2", calculadoEm: new Date(),
        },
      });
    await db.insert(scoreHistorico).values({
      orgId, tipo: "cliente", entidadeId: clienteId,
      valorPrincipal: 50,
      snapshot: { churnRisk: 50, rfmRecencia: 0, rfmFrequencia: 0, segmento: semCompraSegmento, explicacao: "Sem compras concluídas ainda." },
      versaoFormula: "v2",
    });
    return;
  }

  const ultimaCompra = pedidos[0].createdAt;
  const diasDesdeUltima = Math.floor((Date.now() - ultimaCompra.getTime()) / 86_400_000);
  const valorTotal = pedidos.reduce((acc, p) => acc + parseFloat(p.total), 0);

  let intervalMedio: number | null = null;
  if (pedidos.length > 1) {
    const intervals = pedidos.slice(0, -1).map((p, i) =>
      (p.createdAt.getTime() - pedidos[i + 1].createdAt.getTime()) / 86_400_000
    );
    intervalMedio = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  const resultado = calcularScoreCliente({
    diasDesdeUltimaCompra: diasDesdeUltima,
    totalCompras: pedidos.length,
    valorTotalGasto: valorTotal,
    intervalMedioEntrCompras: intervalMedio,
  });

  const proximaCompraEstimada = resultado.proximaCompraEstimadaDias != null && resultado.proximaCompraEstimadaDias > 0
    ? addDays(new Date(), resultado.proximaCompraEstimadaDias)
    : null;

  const scoreAnterior = await db
    .select({ churnRisk: scoreCliente.churnRisk })
    .from(scoreCliente)
    .where(eq(scoreCliente.clienteId, clienteId))
    .then((r) => r[0]?.churnRisk ?? null);

  await db
    .insert(scoreCliente)
    .values({
      orgId, clienteId,
      churnRisk: resultado.churnRisk,
      rfmRecencia: resultado.rfmRecencia,
      rfmFrequencia: resultado.rfmFrequencia,
      rfmValor: resultado.rfmValor.toFixed(2),
      proximaCompraEstimada,
      probabilidadeRecompra30d: resultado.probabilidadeRecompra30d,
      segmento: resultado.segmento,
      acaoSugerida: resultado.acaoSugerida,
      explicacao: resultado.explicacao,
      versaoFormula: resultado.versaoFormula,
    })
    .onConflictDoUpdate({
      target: scoreCliente.clienteId,
      set: {
        churnRisk: resultado.churnRisk,
        rfmRecencia: resultado.rfmRecencia,
        rfmFrequencia: resultado.rfmFrequencia,
        rfmValor: resultado.rfmValor.toFixed(2),
        proximaCompraEstimada,
        probabilidadeRecompra30d: resultado.probabilidadeRecompra30d,
        segmento: resultado.segmento,
        acaoSugerida: resultado.acaoSugerida,
        explicacao: resultado.explicacao,
        versaoFormula: resultado.versaoFormula,
        calculadoEm: new Date(),
      },
    });

  await db.insert(scoreHistorico).values({
    orgId, tipo: "cliente", entidadeId: clienteId,
    valorPrincipal: resultado.churnRisk,
    snapshot: {
      churnRisk: resultado.churnRisk,
      rfmRecencia: resultado.rfmRecencia,
      rfmFrequencia: resultado.rfmFrequencia,
      rfmValor: resultado.rfmValor,
      proximaCompraEstimadaDias: resultado.proximaCompraEstimadaDias,
      probabilidadeRecompra30d: resultado.probabilidadeRecompra30d,
      segmento: resultado.segmento,
      acaoSugerida: resultado.acaoSugerida,
      explicacao: resultado.explicacao,
    },
    versaoFormula: resultado.versaoFormula,
  });

  if (scoreAnterior !== null && Math.abs(scoreAnterior - resultado.churnRisk) >= 10) {
    await emitirEvento({
      tipo: "score.churn_alterado",
      orgId,
      entidade: "score_cliente",
      entidadeId: clienteId,
      payload: { churnAnterior: scoreAnterior, churnNovo: resultado.churnRisk },
    });
  }
}

export async function recalcularScoreProduto(orgId: string, produtoId: string): Promise<void> {
  const produtoRow = await db.select().from(produto).where(eq(produto.id, produtoId)).then((r) => r[0]);
  // Saldo do produto = maior entre os canais: o mesmo lote é anunciado em
  // todos, então somar contaria a mesma peça mais de uma vez.
  const saldoAtual = await db
    .select({ saldo: sql<number>`coalesce(max(${estoqueCanalSaldo.saldo}), 0)` })
    .from(estoqueCanalSaldo)
    .where(and(eq(estoqueCanalSaldo.orgId, orgId), eq(estoqueCanalSaldo.produtoId, produtoId)))
    .then((r) => Number(r[0]?.saldo ?? 0));

  if (!produtoRow) return;

  const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000);

  const [ultimaVendaRow, giroRow] = await Promise.all([
    db
      .select({ data: pedido.createdAt })
      .from(pedido)
      .innerJoin(pedidoItem, eq(pedidoItem.pedidoId, pedido.id))
      .where(and(eq(pedidoItem.produtoId, produtoId), eq(pedido.status, "concluido")))
      .orderBy(desc(pedido.createdAt))
      .limit(1)
      .then((r) => r[0]?.data ?? null),
    db
      .select({ totalVendido: sql<number>`coalesce(sum(${pedidoItem.quantidade}), 0)` })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(
        eq(pedidoItem.produtoId, produtoId),
        eq(pedido.status, "concluido"),
        gte(pedido.createdAt, trintaDiasAtras),
      ))
      .then((r) => Number(r[0]?.totalVendido ?? 0)),
  ]);

  // Sem venda concluída, a régua é a data de cadastro do produto — mesmo
  // ajuste feito no A7-encalhe e em listarProdutosParados (estoque.service):
  // um valor fixo (era 999) fazia todo produto recém-importado nascer com
  // risco de encalhe máximo no primeiro cálculo noturno.
  const referencia = ultimaVendaRow ?? produtoRow.createdAt;
  const diasSemVenda = Math.floor((Date.now() - referencia.getTime()) / 86_400_000);

  const resultado = calcularScoreProduto({
    diasSemVenda,
    giroMensalMedio: giroRow,
    saldoAtual,
    precoUnitario: parseFloat(produtoRow.preco ?? "0"),
  });

  await db
    .insert(scoreProduto)
    .values({
      orgId, produtoId,
      riscoEncalhe: resultado.riscoEncalhe,
      diasSemVenda,
      capitalParado: resultado.capitalParado.toFixed(2),
      acaoSugerida: resultado.acaoSugerida,
      versaoFormula: resultado.versaoFormula,
    })
    .onConflictDoUpdate({
      target: scoreProduto.produtoId,
      set: {
        riscoEncalhe: resultado.riscoEncalhe,
        diasSemVenda,
        capitalParado: resultado.capitalParado.toFixed(2),
        acaoSugerida: resultado.acaoSugerida,
        versaoFormula: resultado.versaoFormula,
        calculadoEm: new Date(),
      },
    });

  await db.insert(scoreHistorico).values({
    orgId, tipo: "produto", entidadeId: produtoId,
    valorPrincipal: resultado.riscoEncalhe,
    snapshot: {
      riscoEncalhe: resultado.riscoEncalhe,
      diasSemVenda,
      capitalParado: resultado.capitalParado,
      acaoSugerida: resultado.acaoSugerida,
    },
    versaoFormula: resultado.versaoFormula,
  });

  if (resultado.riscoEncalhe >= 70) {
    await emitirEvento({
      tipo: "estoque.parado_detectado",
      orgId,
      entidade: "score_produto",
      entidadeId: produtoId,
      payload: { sku: produtoRow.sku, riscoEncalhe: resultado.riscoEncalhe, capitalParado: resultado.capitalParado },
    });
  }
}

export async function obterHistoricoScore(
  orgId: string,
  tipo: "cliente" | "produto",
  entidadeId: string,
  limite = 30,
) {
  return db
    .select()
    .from(scoreHistorico)
    .where(and(
      eq(scoreHistorico.orgId, orgId),
      eq(scoreHistorico.tipo, tipo),
      eq(scoreHistorico.entidadeId, entidadeId),
    ))
    .orderBy(desc(scoreHistorico.calculadoEm))
    .limit(limite);
}
