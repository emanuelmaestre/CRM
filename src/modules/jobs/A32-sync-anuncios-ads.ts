import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivre } from "@/modules/anuncios/application/sincronizacao.service";
import { sincronizarAnunciosShopee } from "@/modules/anuncios/application/sincronizacao-shopee.service";
import { finalizarJob, iniciarJob } from "./job-monitor";

/** Sincronização diária do módulo Anúncios (Product Ads do Mercado Livre e,
 *  desde 26/08/2026, da Shopee) — sem gatilho automático até aqui, o snapshot
 *  nunca era atualizado depois da primeira carga manual feita em
 *  desenvolvimento (ver checklist do módulo). Uma vez por dia é o suficiente:
 *  as duas APIs só atualizam os números de publicidade algumas vezes ao dia,
 *  o mesmo raciocínio já usado em A5/A18 para as outras coletas por marca —
 *  rodar de hora em hora não traria dado mais fresco, só gastaria rate limit
 *  à toa. */
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
      // Um step por marketplace, não um step só: a coleta da Shopee fatia a
      // janela em pedaços de 15 dias e pode ficar longa, e step grande estoura
      // o tempo do Inngest e reexecuta o job inteiro em loop, refazendo as
      // chamadas de API já pagas (ver memória "inngest-step-granularidade").
      // Separados, uma falha de um marketplace também não repete o outro.
      const resultadoML = await step.run("sincronizar-mercadolivre", () => {
        const ctx: CrudContext = { orgId, perfil: "admin", db };
        return sincronizarAnunciosMercadoLivre(ctx);
      });

      const resultadoShopee = await step.run("sincronizar-shopee", () => {
        const ctx: CrudContext = { orgId, perfil: "admin", db };
        return sincronizarAnunciosShopee(ctx);
      });

      const resultado = [...resultadoML, ...resultadoShopee];

      // Isolamento já é feito dentro dos serviços (uma marca com erro não
      // derruba as outras) — o job só falha quando NENHUMA conta sincronizou
      // com sucesso em NENHUM marketplace, o mesmo critério usado em A5 para
      // causa sistêmica (credencial vencida, canal fora do ar) em vez de ruído
      // pontual. Enquanto a Shopee estiver sem o app de Anúncios autorizado,
      // as linhas dela vêm em "erro" e o Mercado Livre sozinho segura o job.
      const semErroSistemico = resultado.some((marca) => marca.status === "ok");
      if (!semErroSistemico && resultado.length > 0) {
        throw new Error(
          `A32 não sincronizou nenhuma das ${resultado.length} conta(s) — ${resultado.map((m) => `${m.brandSlug}: ${m.status}`).join(", ")}`,
        );
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return {
        orgId,
        marcas: resultado.length,
        mercadolivre: resultadoML.length,
        shopee: resultadoShopee.length,
        resultado,
      };
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
