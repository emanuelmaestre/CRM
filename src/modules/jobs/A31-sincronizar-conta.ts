import { eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import { importarCatalogoContaMercadoLivre, importarCatalogoContaShopee } from "@/modules/estoque/application/importar-catalogo.service";
import { ErroSkuSemProduto, ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { emitirEvento } from "@/shared/events";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivreConta } from "@/modules/anuncios/application/sincronizacao.service";
import { sincronizarAvaliacoesMercadoLivreConta, sincronizarAvaliacoesShopeeConta } from "@/modules/canais/application/avaliacoes.service";
import { sincronizarConversasMercadoLivreConta } from "@/modules/inbox/application/inbox.service";
import { obterReclamacoesAbertas } from "@/modules/metricas/application/reclamacoes.service";
import { obterReputacao } from "@/modules/metricas/application/reputacao.service";

type ExecucaoPatch = Partial<typeof sincronizacaoExecucao.$inferInsert>;
type ModuloSincronizacao =
  | "catalogo"
  | "pedidos"
  | "anuncios"
  | "avaliacoes"
  | "reputacao"
  | "reclamacoes"
  | "mensagens";

const COLUNAS: Record<ModuloSincronizacao, { status: keyof ExecucaoPatch; resultado: keyof ExecucaoPatch; erro: keyof ExecucaoPatch }> = {
  catalogo: { status: "catalogoStatus", resultado: "catalogoResultado", erro: "catalogoErro" },
  pedidos: { status: "pedidosStatus", resultado: "pedidosResultado", erro: "pedidosErro" },
  anuncios: { status: "anunciosStatus", resultado: "anunciosResultado", erro: "anunciosErro" },
  avaliacoes: { status: "avaliacoesStatus", resultado: "avaliacoesResultado", erro: "avaliacoesErro" },
  reputacao: { status: "reputacaoStatus", resultado: "reputacaoResultado", erro: "reputacaoErro" },
  reclamacoes: { status: "reclamacoesStatus", resultado: "reclamacoesResultado", erro: "reclamacoesErro" },
  mensagens: { status: "mensagensStatus", resultado: "mensagensResultado", erro: "mensagensErro" },
};

function erroLegivel(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function semSuporte(modulo: string, tipo: string) {
  return {
    semSuporte: true,
    mensagem: `${modulo} ainda não tem sincronização ativa para contas ${tipo}.`,
  };
}

/** Disparo manual da Central de Sincronização (Configurações) — fila completa
 *  de UMA conta, cada módulo atualizando sua própria coluna de
 *  status em sincronizacao_execucao pra tela poder mostrar progresso real
 *  (não é lote noturno como A24/A27: é "clicou, quero ver andando agora"). */
export const A31_sincronizarConta = inngest.createFunction(
  {
    id: "A31-sincronizar-conta",
    name: "A31 — Sincronização manual de conta (fila completa)",
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

    const ctx: CrudContext = { orgId, perfil: "admin", db };

    async function atualizarExecucao(patch: ExecucaoPatch) {
      await db.update(sincronizacaoExecucao).set(patch).where(eq(sincronizacaoExecucao.id, execucaoId));
    }

    function patchStatus(modulo: ModuloSincronizacao, status: "pendente" | "em_andamento" | "concluido" | "erro", extra: ExecucaoPatch = {}): ExecucaoPatch {
      return { [COLUNAS[modulo].status]: status, ...extra } as ExecucaoPatch;
    }

    function patchResultado(modulo: ModuloSincronizacao, resultado: unknown): ExecucaoPatch {
      return patchStatus(modulo, "concluido", { [COLUNAS[modulo].resultado]: resultado } as ExecucaoPatch);
    }

    function patchErro(modulo: ModuloSincronizacao, error: unknown): ExecucaoPatch {
      return patchStatus(modulo, "erro", { [COLUNAS[modulo].erro]: erroLegivel(error) } as ExecucaoPatch);
    }

    async function executarModulo(modulo: ModuloSincronizacao, trabalho: () => Promise<unknown>): Promise<{ ok: true; resultado: unknown } | { ok: false; erro: string }> {
      await step.run(`${modulo}-em-andamento`, () => atualizarExecucao(patchStatus(modulo, "em_andamento")));
      try {
        const resultado = await step.run(modulo, trabalho);
        await step.run(`${modulo}-concluido`, () => atualizarExecucao(patchResultado(modulo, resultado)));
        return { ok: true, resultado };
      } catch (error) {
        await step.run(`${modulo}-erro`, () => atualizarExecucao(patchErro(modulo, error)));
        return { ok: false, erro: erroLegivel(error) };
      }
    }

    await executarModulo("catalogo", async () => (
      conta.tipo === "mercadolivre"
        ? importarCatalogoContaMercadoLivre(ctx, channelAccountId)
        : conta.tipo === "shopee"
          ? importarCatalogoContaShopee(ctx, channelAccountId)
          : { produtosCriados: 0, ignorados: 0, ...semSuporte("Catálogo", conta.tipo) }
    ));

    const resultadoPedidos = await executarModulo("pedidos", async () => {
      // Mesmo freio do A24: app Shopee aprovado não tem permissão pra API de
      // Pedidos, reverter junto com SHOPEE_PEDIDOS_LIBERADO.
      if (conta.tipo === "shopee" && !SHOPEE_PEDIDOS_LIBERADO) {
        return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      }
      const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug ?? "");
      if (!provider) return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
      const pedidos = await provider.buscarPedidos(desde);
      let novos = 0;
      // Pedido de anúncio já removido do catálogo é pulado, não aborta a leva
      // — ver ErroSkuSemProduto. Os SKUs vão no resultado pra ficar visível na
      // Central de Sincronização o que não entrou e por quê.
      const skusSemProduto = new Set<string>();
      let ignorados = 0;
      for (const pedidoBruto of pedidos) {
        const pedidoNormalizado = { ...pedidoBruto, criadoEm: new Date(pedidoBruto.criadoEm) };
        try {
          const resultado = await ingerirPedido(orgId, conta.brandId, channelAccountId, pedidoNormalizado);
          if (resultado.novo) novos += 1;
        } catch (error) {
          if (!(error instanceof ErroSkuSemProduto)) throw error;
          ignorados += 1;
          for (const sku of error.skus) skusSemProduto.add(sku);
        }
      }
      return {
        encontrados: pedidos.length,
        novos,
        ...(ignorados > 0 ? { ignorados, skusSemProduto: [...skusSemProduto] } : {}),
      };
    });
    if (!resultadoPedidos.ok) {
      await emitirEvento({
        tipo: "canal.degradado",
        orgId,
        brandId: conta.brandId,
        entidade: "channel_account",
        entidadeId: channelAccountId,
        payload: { motivo: "falha-sincronizacao-manual-pedidos", erro: resultadoPedidos.erro },
      });
    }

    await executarModulo("anuncios", async () => (
      conta.tipo === "mercadolivre"
        ? sincronizarAnunciosMercadoLivreConta(ctx, channelAccountId)
        : semSuporte("Anúncios patrocinados", conta.tipo)
    ));

    await executarModulo("avaliacoes", async () => (
      conta.tipo === "mercadolivre"
        ? sincronizarAvaliacoesMercadoLivreConta(orgId, channelAccountId)
        : conta.tipo === "shopee"
          ? sincronizarAvaliacoesShopeeConta(orgId, channelAccountId)
          : semSuporte("Avaliações", conta.tipo)
    ));

    await executarModulo("reputacao", async () => {
      if (conta.tipo !== "mercadolivre") return semSuporte("Reputação/Termômetro", conta.tipo);
      const resultado = await obterReputacao(ctx, { channelAccountId, ignorarCache: true });
      const marca = resultado.marcas[0];
      return {
        marcas: resultado.marcas.length,
        marcasComFalha: resultado.marcasComFalha,
        termometro: marca?.faixaLabel ?? null,
        vendasConcluidas: marca?.vendasConcluidas ?? null,
        semContaConectada: resultado.semContaConectada,
      };
    });

    await executarModulo("reclamacoes", async () => {
      if (conta.tipo !== "mercadolivre") return semSuporte("Reclamações", conta.tipo);
      const resultado = await obterReclamacoesAbertas(ctx, { channelAccountId });
      return {
        total: resultado.total,
        emMediacao: resultado.itens.filter((item) => item.emMediacao).length,
        marcasComFalha: resultado.marcasComFalha,
        semContaConectada: resultado.semContaConectada,
      };
    });

    await executarModulo("mensagens", async () => (
      conta.tipo === "mercadolivre"
        ? sincronizarConversasMercadoLivreConta(orgId, channelAccountId, 90)
        : semSuporte("Mensagens", conta.tipo)
    ));

    await step.run("finalizar-execucao", () =>
      atualizarExecucao({ finalizadoEm: new Date() }),
    );

    return { execucaoId };
  },
);
