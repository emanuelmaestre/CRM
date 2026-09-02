import { and, eq, inArray } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { auditarPedidosDaConta, type ResumoAuditoria } from "@/modules/vendas/application/conferencia-financeira.service";
import { finalizarJob, iniciarJob } from "./job-monitor";
import { EVENTO_AUDITAR_FINANCEIRO } from "./eventos-operacionais";

/* ── Por que este job existe ──────────────────────────────────────
   Os valores financeiros de um pedido chegam de APIs diferentes e não fecham
   entre si: o Mercado Livre mede `order.total_amount` (só produtos), a Shopee
   mede `buyer_total_amount` (com frete e voucher) e só ela expõe o repasse
   real. O CRM já guarda os componentes, mas ninguém confere se a soma deles
   reconstrói o bruto que a API dona daquele número informou.

   Esta volta faz essa conta por pedido. Quando não fecha, re-busca na API
   responsável e regrava pelo mesmo caminho do `reconciliarFinanceiroPedido`
   (via `ingerirPedido`, idempotente). O resíduo que sobrar depois disso vira
   linha em `conferencia_financeira` — o log. O agente nunca grava um valor
   calculado por ele.

   A detecção da divergência já acontece na ingestão (`deteccao-conferencia.ts`),
   de graça. Aqui o A35 faz só a parte cara: re-buscar na API do canal os
   pedidos marcados `detectado` e re-tentar os `persistente`/`aguardando` fora
   do cooldown de 7 dias. Roda depois da A34 (05:00), que já pode ter trazido
   repasse novo. Falha de uma conta não derruba a volta. */

const MAX_REBUSCAS_POR_CONTA = 50;

export const A35_auditarFinanceiro = inngest.createFunction(
  {
    id: "A35-auditar-financeiro",
    name: "A35 — Conferência financeira (re-busca e resolução)",
    concurrency: { limit: 1 },
    triggers: [
      { cron: "0 6 * * *" },
      { event: EVENTO_AUDITAR_FINANCEIRO },
    ],
  },
  async ({ step, attempt }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const jobId = await step.run("registrar-inicio", () => iniciarJob({
      orgId,
      nome: "A35-auditar-financeiro",
      tentativa: attempt,
    }));

    try {
      const contas = await step.run("buscar-contas-conectadas", () =>
        db
          .select({ id: channelAccount.id, tipo: channelAccount.tipo, brandSlug: brand.slug })
          .from(channelAccount)
          .innerJoin(brand, and(
            eq(brand.id, channelAccount.brandId),
            eq(brand.orgId, channelAccount.orgId),
          ))
          .where(and(
            eq(channelAccount.orgId, orgId),
            eq(channelAccount.status, "conectado"),
            inArray(channelAccount.tipo, ["mercadolivre", "shopee", "tiktokshop"]),
          )),
      );

      if (contas.length === 0) {
        throw new Error("A35 sem contas de canais de venda conectadas para auditar.");
      }

      const porConta: Array<{ contaId: string; tipo: string; marca: string; resumo?: ResumoAuditoria; erro?: string }> = [];

      for (const conta of contas) {
        const resultado = await step.run(`auditar-${conta.id}`, async () => {
          try {
            const resumo = await auditarPedidosDaConta(orgId, conta.id, { maxRebuscas: MAX_REBUSCAS_POR_CONTA });
            return { contaId: conta.id, tipo: conta.tipo, marca: conta.brandSlug, resumo };
          } catch (error) {
            const erro = error instanceof Error ? error.message : String(error);
            console.warn(`[A35] conta ${conta.brandSlug}/${conta.tipo} pulada: ${erro}`);
            return { contaId: conta.id, tipo: conta.tipo, marca: conta.brandSlug, erro };
          }
        });
        porConta.push(resultado);
      }

      type CampoNumerico = {
        [K in keyof ResumoAuditoria]: ResumoAuditoria[K] extends number ? K : never
      }[keyof ResumoAuditoria];
      const soma = (campo: CampoNumerico) =>
        porConta.reduce((total, item) => total + (item.resumo?.[campo] ?? 0), 0);

      const resumo = {
        contas: porConta.length,
        pulados: porConta.filter((item) => item.erro).length,
        backstop: soma("backstop"),
        candidatos: soma("candidatos"),
        rebuscas: soma("rebuscas"),
        emCooldown: soma("emCooldown"),
        resolvidos: soma("resolvidos"),
        persistentes: soma("persistentes"),
        novasPersistentes: soma("novasPersistentes"),
        aguardando: soma("aguardando"),
        contasAlertadas: porConta.filter((item) => item.resumo?.alertou).length,
        porConta,
      };

      /* Todas as contas puladas é sinal de problema sistêmico (credencial,
         banco). Uma ou outra não: a volta cumpriu o que dava. */
      if (resumo.pulados > 0 && resumo.pulados === porConta.length) {
        throw new Error(`A35 incompleta: todas as ${porConta.length} conta(s) falharam. Conferir por conta.`);
      }

      await step.run("registrar-sucesso", () => finalizarJob(jobId));
      return resumo;
    } catch (error) {
      await step.run("registrar-falha", () => finalizarJob(jobId, error));
      throw error;
    }
  },
);
