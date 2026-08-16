import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { cliente, pedido, pedidoItem, produtoCanal } from "@/shared/lib/db/schema";

/* ── Provável comprador de uma opinião ────────────────────────────
   O Mercado Livre não expõe quem escreveu a opinião — é anônima por política
   de privacidade deles, nem o vendedor vê isso no painel oficial. O que dá
   pra fazer é cruzar: quem comprou aquele anúncio específico num intervalo
   plausível antes da data da opinião? Se só existe UM comprador candidato
   nesse intervalo, a identificação é tratada como certa. Se existir mais de
   um (dois clientes compraram o mesmo produto na mesma janela) ou nenhum, a
   opinião fica sem identificação — nunca um "provável" ambíguo: ou é certeza,
   ou fica pendente. */

// Janela entre a compra e a opinião: cedo demais (mesmo dia) é raro mas
// possível (produto que já estava em mãos, ex. reposição); tarde demais
// (90 dias) já é jogar rede grande demais e começar a pegar comprador errado.
const JANELA_MINIMA_DIAS = 0;
const JANELA_MAXIMA_DIAS = 90;

export interface CompradorIdentificado {
  clienteId: string;
  clienteNome: string;
  pedidoId: string;
  pedidoCriadoEm: string;
}

/** Uma chamada só para todos os anúncios/opiniões da tela — nunca uma
 *  consulta por opinião individual, que explodiria em N+1 numa lista com
 *  centenas de itens. */
export async function identificarCompradoresDeOpinioes(
  orgId: string,
  itens: Array<{ listingId: string; opinioes: Array<{ id: string; criadaEm: string | null }> }>,
): Promise<Map<string, CompradorIdentificado | null>> {
  const resultado = new Map<string, CompradorIdentificado | null>();
  const listingIds = [...new Set(itens.map((item) => item.listingId))];
  if (listingIds.length === 0) return resultado;

  const mapeamentos = await db
    .select({ externalListingId: produtoCanal.externalListingId, produtoId: produtoCanal.produtoId })
    .from(produtoCanal)
    .where(and(eq(produtoCanal.orgId, orgId), inArray(produtoCanal.externalListingId, listingIds)));
  const produtoIdsPorListing = new Map<string, string[]>();
  for (const linha of mapeamentos) {
    const lista = produtoIdsPorListing.get(linha.externalListingId) ?? [];
    lista.push(linha.produtoId);
    produtoIdsPorListing.set(linha.externalListingId, lista);
  }

  const todosProdutoIds = [...new Set(mapeamentos.map((m) => m.produtoId))];
  if (todosProdutoIds.length === 0) return resultado;

  // Todos os pedidos que tocam algum desses produtos, com data e cliente —
  // filtrado depois em memória por produto/janela, mais simples e barato que
  // uma consulta por opinião.
  const pedidosCandidatos = await db
    .select({
      pedidoId: pedido.id,
      produtoId: pedidoItem.produtoId,
      clienteId: pedido.clienteId,
      clienteNome: cliente.nome,
      criadoEm: pedido.createdAt,
    })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(
      eq(pedido.orgId, orgId),
      inArray(pedidoItem.produtoId, todosProdutoIds),
    ));

  const pedidosPorProduto = new Map<string, typeof pedidosCandidatos>();
  for (const linha of pedidosCandidatos) {
    const lista = pedidosPorProduto.get(linha.produtoId) ?? [];
    lista.push(linha);
    pedidosPorProduto.set(linha.produtoId, lista);
  }

  for (const item of itens) {
    const produtoIds = produtoIdsPorListing.get(item.listingId) ?? [];
    const candidatosDoAnuncio = produtoIds.flatMap((produtoId) => pedidosPorProduto.get(produtoId) ?? []);

    for (const opiniao of item.opinioes) {
      if (!opiniao.criadaEm) { resultado.set(opiniao.id, null); continue; }
      const dataOpiniao = new Date(opiniao.criadaEm).getTime();
      if (Number.isNaN(dataOpiniao)) { resultado.set(opiniao.id, null); continue; }
      const janelaMin = dataOpiniao - JANELA_MAXIMA_DIAS * 86_400_000;
      const janelaMax = dataOpiniao - JANELA_MINIMA_DIAS * 86_400_000;

      const dentroDaJanela = candidatosDoAnuncio.filter((candidato) => {
        const t = candidato.criadoEm.getTime();
        return t >= janelaMin && t <= janelaMax;
      });

      const clientesUnicos = new Set(dentroDaJanela.map((c) => c.clienteId));
      if (clientesUnicos.size !== 1) { resultado.set(opiniao.id, null); continue; }

      // Um cliente só, possivelmente mais de um pedido dele na janela — pega
      // o pedido mais próximo da data da opinião.
      const maisProximo = dentroDaJanela.reduce((melhor, atual) =>
        Math.abs(atual.criadoEm.getTime() - dataOpiniao) < Math.abs(melhor.criadoEm.getTime() - dataOpiniao) ? atual : melhor
      );
      resultado.set(opiniao.id, {
        clienteId: maisProximo.clienteId,
        clienteNome: maisProximo.clienteNome,
        pedidoId: maisProximo.pedidoId,
        pedidoCriadoEm: maisProximo.criadoEm.toISOString(),
      });
    }
  }

  return resultado;
}
