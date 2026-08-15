import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivre } from "@/modules/anuncios/application/sincronizacao.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

/** Sincronização diária do módulo Anúncios (Product Ads/Mercado Livre) —
 *  sem gatilho automático até aqui, o snapshot nunca era atualizado depois
 *  da primeira carga manual feita em desenvolvimento (ver checklist do
 *  módulo). Uma vez por dia é o suficiente: a API do ML só atualiza os
 *  números de publicidade algumas vezes ao dia, o mesmo raciocínio já
 *  usado em A5/A18 para as outras coletas por marca — rodar de hora em
 *  hora não traria dado mais fresco, só gastaria rate limit à toa. */
export const A32_syncAnunciosAds = inngest.createFunction(
  {
    id: "A32-sync-anuncios-ads",
    name: "A32 — Sincronização diária de Product Ads (Anúncios)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({ orgId, nome: "A32-sync-anuncios-ads", tentativa: attempt }));

    try {
      const resultado = await step.run("sincronizar", () => {
        const ctx: CrudContext = { orgId, perfil: "admin", db };
        return sincronizarAnunciosMercadoLivre(ctx);
      });

      // Isolamento já é feito dentro do serviço (uma marca com erro não
      // derruba as outras) — o job só falha quando NENHUMA marca sincronizou
      // com sucesso, o mesmo critério usado em A5 para causa sistêmica
      // (credencial vencida, canal fora do ar) em vez de ruído pontual.
      const semErroSistemico = resultado.some((marca) => marca.status === "ok");
      if (!semErroSistemico && resultado.length > 0) {
        throw new Error(
          `A32 não sincronizou nenhuma das ${resultado.length} marca(s) — ${resultado.map((m) => `${m.brandSlug}: ${m.status}`).join(", ")}`,
        );
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return { orgId, marcas: resultado.length, resultado };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
