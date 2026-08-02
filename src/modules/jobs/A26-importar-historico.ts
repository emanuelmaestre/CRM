import { inngest } from "@/shared/lib/inngest/client";
import {
  finalizarImportacaoLoteHistorico,
  importarProximoBlocoHistorico,
  marcarFalhaLoteHistorico,
} from "@/modules/importacao/application/importacao-historica.service";

export const A26_importarHistorico = inngest.createFunction(
  {
    id: "A26-importar-historico",
    name: "A26 — Promover pedidos históricos validados",
    concurrency: { limit: 1 },
    retries: 3,
    triggers: [{ event: "importacao/historica.confirmar" }],
  },
  async ({ event, step }) => {
    const { loteId, total } = event.data as { loteId: string; total: number };
    try {
      const blocos = Math.max(1, Math.ceil(total / 50));
      for (let indice = 0; indice < blocos; indice++) {
        const resultado = await step.run(`importar-bloco-${indice}`, () => importarProximoBlocoHistorico(loteId, 50));
        if (resultado.encontrados === 0) break;
      }
      return await step.run("finalizar-importacao", () => finalizarImportacaoLoteHistorico(loteId));
    } catch (error) {
      await step.run("registrar-falha-importacao", () => marcarFalhaLoteHistorico(loteId, error));
      throw error;
    }
  },
);
