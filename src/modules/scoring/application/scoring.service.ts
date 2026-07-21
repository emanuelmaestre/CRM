import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import {
  scoreCliente, scoreProduto, pedido, pedidoItem,
  estoqueSaldo, produto,
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
    await db
      .insert(scoreCliente)
      .values({
        orgId, clienteId,
        churnRisk: 50, rfmRecencia: 0, rfmFrequencia: 0,
        explicacao: "Sem compras concluídas ainda.", versaoFormula: "v1",
      })
      .onConflictDoUpdate({
        target: scoreCliente.clienteId,
        set: { churnRisk: 50, rfmRecencia: 0, rfmFrequencia: 0, calculadoEm: new Date() },
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
        explicacao: resultado.explicacao,
        calculadoEm: new Date(),
      },
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
  const saldoRow = await db.select().from(estoqueSaldo).where(eq(estoqueSaldo.produtoId, produtoId)).then((r) => r[0]);

  if (!produtoRow || !saldoRow) return;

  const ultimaVenda = await db
    .select({ data: pedido.createdAt })
    .from(pedido)
    .innerJoin(pedidoItem, eq(pedidoItem.pedidoId, pedido.id))
    .where(and(eq(pedidoItem.produtoId, produtoId), eq(pedido.status, "concluido")))
    .orderBy(desc(pedido.createdAt))
    .limit(1)
    .then((r) => r[0]?.data ?? null);

  const diasSemVenda = ultimaVenda
    ? Math.floor((Date.now() - ultimaVenda.getTime()) / 86_400_000)
    : 999;

  const resultado = calcularScoreProduto({
    diasSemVenda,
    giroMensalMedio: 0,
    saldoAtual: saldoRow.saldo,
    custoUnitario: parseFloat(produtoRow.custo ?? "0"),
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
        calculadoEm: new Date(),
      },
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
