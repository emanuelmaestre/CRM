import { inngest } from "@/shared/lib/inngest/client";
import {
  finalizarPreparacaoLoteHistorico,
  marcarFalhaLoteHistorico,
  prepararPaginaLoteHistorico,
} from "@/modules/importacao/application/importacao-historica.service";

export const A25_prepararImportacaoHistorica = inngest.createFunction(
  {
    id: "A25-preparar-importacao-historica",
    name: "A25 — Preparar pedidos históricos do Mercado Livre",
    concurrency: { limit: 1 },
    retries: 3,
    triggers: [{ event: "importacao/historica.preparar" }],
  },
  async ({ event, step }) => {
    const { loteId } = event.data as { loteId: string };
    try {
      let pagina = await step.run("coletar-pagina-0", () => prepararPaginaLoteHistorico(loteId, 0));
      let indice = 1;
      while (pagina.proximoOffset < pagina.total && pagina.encontrou > 0) {
        const offset = pagina.proximoOffset;
        pagina = await step.run(`coletar-pagina-${indice}`, () => prepararPaginaLoteHistorico(loteId, offset));
        indice++;
      }
      return await step.run("finalizar-preparacao", () => finalizarPreparacaoLoteHistorico(loteId));
    } catch (error) {
      await step.run("registrar-falha-preparacao", () => marcarFalhaLoteHistorico(loteId, error));
      throw error;
    }
  },
);
