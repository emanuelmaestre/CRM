import { eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import { importarCatalogoContaMercadoLivre } from "@/modules/estoque/application/importar-catalogo.service";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { emitirEvento } from "@/shared/events";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivreConta } from "@/modules/anuncios/application/sincronizacao.service";
import { sincronizarAvaliacoesMercadoLivreConta } from "@/modules/canais/application/avaliacoes.service";
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

/** Janela do backfill de pedidos na sincronização manual. */
const JANELA_BACKFILL_DIAS = 90;

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
    // Era o único job sem teto de concorrência. `idempotency` só impede a
    // mesma execução de rodar duas vezes; nada impedia as contas de todas as
    // marcas e canais de sincronizarem ao mesmo tempo, cada uma abrindo suas
    // próprias transações de ingestão sobre a conexão única do banco (ver
    // getDatabaseClientOptions em db/index.ts). Enfileirar é mais lento por
    // conta e muito mais rápido no total.
    concurrency: { limit: 1 },
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

    /** Bookkeeping de status do módulo em volta de um trabalho que cria os
     *  próprios steps. Use quando o módulo não cabe numa etapa só. */
    async function executarModuloEmEtapas(
      modulo: ModuloSincronizacao,
      trabalho: () => Promise<unknown>,
    ): Promise<{ ok: true; resultado: unknown } | { ok: false; erro: string }> {
      await step.run(`${modulo}-em-andamento`, () => atualizarExecucao(patchStatus(modulo, "em_andamento")));
      try {
        const resultado = await trabalho();
        await step.run(`${modulo}-concluido`, () => atualizarExecucao(patchResultado(modulo, resultado)));
        return { ok: true, resultado };
      } catch (error) {
        await step.run(`${modulo}-erro`, () => atualizarExecucao(patchErro(modulo, error)));
        return { ok: false, erro: erroLegivel(error) };
      }
    }

    /** Módulo que cabe numa etapa só — o caso comum. */
    function executarModulo(modulo: ModuloSincronizacao, trabalho: () => Promise<unknown>) {
      return executarModuloEmEtapas(modulo, () => step.run(modulo, trabalho));
    }

    await executarModulo("catalogo", async () => (
      conta.tipo === "mercadolivre"
        ? importarCatalogoContaMercadoLivre(ctx, channelAccountId)
        : { produtosCriados: 0, ignorados: 0, ...semSuporte("Catálogo", conta.tipo) }
    ));

    /* Uma etapa por pedido, não o backfill inteiro numa etapa só.

       A busca cobre 90 dias e cada `ingerirPedido` abre a própria transação —
       segurando, enquanto dura, a conexão única do banco. Tudo isso dentro de
       um `step.run` só significava uma invocação de função com centenas de
       transações em série, muito além do teto de duração da Vercel: a etapa
       estourava, o Inngest reinvocava, e o backfill recomeçava do zero, sem
       nunca terminar e prendendo o banco em cada tentativa.

       Quebrado assim, cada pedido tem seu próprio orçamento de tempo e o
       Inngest memoiza o que já passou — uma reinvocação retoma de onde parou
       em vez de refazer tudo. É o mesmo formato que o A24 já usa. */
    const resultadoPedidos = await executarModuloEmEtapas("pedidos", async () => {
      const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug ?? "");
      if (!provider) return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      const desde = new Date(Date.now() - JANELA_BACKFILL_DIAS * 24 * 60 * 60 * 1_000);
      const pedidos = await step.run("pedidos-buscar", () => provider.buscarPedidos(desde));
      let novos = 0;
      for (const pedidoBruto of pedidos) {
        // `criadoEm` volta como string: atravessou a serialização do step.
        const pedidoNormalizado = { ...pedidoBruto, criadoEm: new Date(pedidoBruto.criadoEm) };
        const resultado = await step.run(`pedidos-ingerir-${pedidoBruto.providerOrderId}`, () =>
          ingerirPedido(orgId, conta.brandId, channelAccountId, pedidoNormalizado),
        );
        if (resultado.novo) novos += 1;
      }
      return { encontrados: pedidos.length, novos };
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
        : semSuporte("Product Ads", conta.tipo)
    ));

    await executarModulo("avaliacoes", async () => (
      conta.tipo === "mercadolivre"
        ? sincronizarAvaliacoesMercadoLivreConta(orgId, channelAccountId)
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
