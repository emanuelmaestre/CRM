import { eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import { importarCatalogoContaMercadoLivre } from "@/modules/estoque/application/importar-catalogo.service";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { emitirEvento } from "@/shared/events";
import type { CrudContext } from "@/shared/lib/crud-factory";

/** Disparo manual da Central de Sincronização (Configurações) — catálogo e
 *  pedidos de UMA conta, cada módulo atualizando sua própria coluna de
 *  status em sincronizacao_execucao pra tela poder mostrar progresso real
 *  (não é lote noturno como A24/A27: é "clicou, quero ver andando agora"). */
export const A31_sincronizarConta = inngest.createFunction(
  {
    id: "A31-sincronizar-conta",
    name: "A31 — Sincronização manual de conta (catálogo + pedidos)",
    idempotency: "event.data.execucaoId",
    triggers: [{ event: "canal/sincronizacao.solicitada" }],
  },
  async ({ event, step }) => {
    const { orgId, channelAccountId, execucaoId } = event.data as {
      orgId: string;
      channelAccountId: string;
      execucaoId: string;
    };

    const conta = await step.run("buscar-conta", () =>
      db
        .select({ id: channelAccount.id, brandId: channelAccount.brandId, tipo: channelAccount.tipo, brandSlug: brand.slug })
        .from(channelAccount)
        .innerJoin(brand, eq(brand.id, channelAccount.brandId))
        .where(eq(channelAccount.id, channelAccountId))
        .then((rows) => rows[0]),
    );
    if (!conta) throw new Error("Conta de canal não encontrada para sincronização.");

    // Só o Mercado Livre tem importação de catálogo pronta hoje — Shopee e
    // TikTok Shop ainda não têm esse módulo implementado, então o passo
    // fica marcado como "concluído" sem trabalho, em vez de erro.
    await step.run("catalogo-em-andamento", () =>
      db.update(sincronizacaoExecucao).set({ catalogoStatus: "em_andamento" }).where(eq(sincronizacaoExecucao.id, execucaoId)),
    );
    try {
      const ctx: CrudContext = { orgId, perfil: "admin", db };
      const resultadoCatalogo = conta.tipo === "mercadolivre"
        ? await step.run("catalogo", () => importarCatalogoContaMercadoLivre(ctx, channelAccountId))
        : { produtosCriados: 0, ignorados: 0, semSuporte: true };
      await step.run("catalogo-concluido", () =>
        db.update(sincronizacaoExecucao)
          .set({ catalogoStatus: "concluido", catalogoResultado: resultadoCatalogo })
          .where(eq(sincronizacaoExecucao.id, execucaoId)),
      );
    } catch (error) {
      await step.run("catalogo-erro", () =>
        db.update(sincronizacaoExecucao)
          .set({ catalogoStatus: "erro", catalogoErro: String(error) })
          .where(eq(sincronizacaoExecucao.id, execucaoId)),
      );
    }

    await step.run("pedidos-em-andamento", () =>
      db.update(sincronizacaoExecucao).set({ pedidosStatus: "em_andamento" }).where(eq(sincronizacaoExecucao.id, execucaoId)),
    );
    try {
      const resultadoPedidos = await step.run("pedidos", async () => {
        const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug ?? "");
        if (!provider) return { encontrados: 0, novos: 0 };
        const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
        const pedidos = await provider.buscarPedidos(desde);
        let novos = 0;
        for (const pedidoBruto of pedidos) {
          const pedidoNormalizado = { ...pedidoBruto, criadoEm: new Date(pedidoBruto.criadoEm) };
          const resultado = await ingerirPedido(orgId, conta.brandId, channelAccountId, pedidoNormalizado);
          if (resultado.novo) novos += 1;
        }
        return { encontrados: pedidos.length, novos };
      });
      await step.run("pedidos-concluido", () =>
        db.update(sincronizacaoExecucao)
          .set({ pedidosStatus: "concluido", pedidosResultado: resultadoPedidos, finalizadoEm: new Date() })
          .where(eq(sincronizacaoExecucao.id, execucaoId)),
      );
    } catch (error) {
      await step.run("pedidos-erro", () =>
        db.update(sincronizacaoExecucao)
          .set({ pedidosStatus: "erro", pedidosErro: String(error), finalizadoEm: new Date() })
          .where(eq(sincronizacaoExecucao.id, execucaoId)),
      );
      await emitirEvento({
        tipo: "canal.degradado",
        orgId,
        brandId: conta.brandId,
        entidade: "channel_account",
        entidadeId: channelAccountId,
        payload: { motivo: "falha-sincronizacao-manual-pedidos", erro: String(error) },
      });
    }

    return { execucaoId };
  },
);
