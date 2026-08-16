import "server-only";

import type { CrudContext } from "@/shared/lib/crud-factory";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import {
  criarLoteHistorico,
  prepararPaginaLoteHistorico,
  finalizarPreparacaoLoteHistorico,
  confirmarLoteHistorico,
  importarProximoBlocoHistorico,
  finalizarImportacaoLoteHistorico,
} from "./importacao-historica.service";

/* ── Backfill automático de histórico ──────────────────────────
   A sincronização em tempo real (A24) só cobre pedidos a partir do momento em
   que a conta foi conectada — e só olha os últimos 10 minutos a cada rodada.
   Se o poller ficar fora do ar por um tempo (deploy, rate limit, instabilidade
   do Mercado Livre), esses pedidos nunca mais entram sozinhos. Esta rotina é
   a rede de segurança: reaproveita o mesmo pipeline de importação histórica
   (mesmas proteções — não mexe em estoque, não dispara automação, preserva a
   data original), rodando com uma janela curta e recorrente em vez do
   intervalo completo do backfill manual, para não fazer milhares de chamadas
   à API do Mercado Livre toda vez que rodar. */

export interface ResultadoBackfillMarca {
  brand: BrandSlug;
  ok: boolean;
  loteId?: string;
  encontrados?: number;
  aceitos?: number;
  quarentena?: number;
  duplicados?: number;
  importados?: number;
  falhas?: number;
  erro?: string;
}

export async function executarBackfillAutomatico(
  ctx: CrudContext,
  opcoes: { brands?: string[]; janelaDias?: number } = {},
): Promise<ResultadoBackfillMarca[]> {
  const janelaDias = Math.min(Math.max(opcoes.janelaDias ?? 45, 1), 3650);
  const de = new Date(Date.now() - janelaDias * 86_400_000).toISOString();
  const ate = new Date(Date.now() - 60_000).toISOString();

  const marcas = (opcoes.brands ?? ["karzi", "wuwu", "armarinhos_lima"]).filter(isBrandSlug);
  const resultados: ResultadoBackfillMarca[] = [];

  for (const brand of marcas) {
    try {
      const { loteId } = await criarLoteHistorico(ctx, { brand, de, ate });

      let offset = 0;
      for (;;) {
        const pagina = await prepararPaginaLoteHistorico(loteId, offset);
        if (pagina.encontrou === 0 || pagina.proximoOffset >= pagina.total) {
          offset = pagina.proximoOffset;
          break;
        }
        offset = pagina.proximoOffset;
      }

      const preparacao = await finalizarPreparacaoLoteHistorico(loteId);
      if (preparacao.aceitos === 0) {
        resultados.push({
          brand, ok: true, loteId,
          encontrados: offset, aceitos: 0, quarentena: preparacao.rejeitados, duplicados: preparacao.duplicados,
          importados: 0, falhas: 0,
        });
        continue;
      }

      await confirmarLoteHistorico(ctx, loteId);

      let importados = 0;
      let duplicados = 0;
      let falhas = 0;
      for (;;) {
        const bloco = await importarProximoBlocoHistorico(loteId, 50);
        importados += bloco.importados;
        duplicados += bloco.duplicados;
        falhas += bloco.erros;
        if (bloco.encontrados === 0) break;
      }
      await finalizarImportacaoLoteHistorico(loteId);

      resultados.push({
        brand, ok: true, loteId,
        encontrados: offset, aceitos: preparacao.aceitos, quarentena: preparacao.rejeitados,
        duplicados, importados, falhas,
      });
    } catch (error) {
      resultados.push({ brand, ok: false, erro: error instanceof Error ? error.message : String(error) });
    }
  }

  return resultados;
}
