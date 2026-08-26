import { eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import {
  importarFatiaCatalogoShopee,
  importarPaginaCatalogoMercadoLivre,
  listarCatalogoShopeeParaImportar,
  resolverContaParaImportar,
  TAMANHO_FATIA_CATALOGO,
} from "@/modules/estoque/application/importar-catalogo.service";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { criarShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import { emitirEvento } from "@/shared/events";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivreConta } from "@/modules/anuncios/application/sincronizacao.service";
import {
  limparAvaliacoesForaDoCatalogoMercadoLivre,
  sincronizarAvaliacoesShopeeConta,
  sincronizarPaginaAvaliacoesMercadoLivre,
} from "@/modules/canais/application/avaliacoes.service";
import { obterReputacao } from "@/modules/metricas/application/reputacao.service";
import {
  MODULOS_SINCRONIZACAO,
  type ModuloSincronizacao,
} from "@/modules/canais/domain/sincronizacao-progresso";

type ExecucaoPatch = Partial<typeof sincronizacaoExecucao.$inferInsert>;

const COLUNAS: Record<ModuloSincronizacao, { status: keyof ExecucaoPatch; resultado: keyof ExecucaoPatch; erro: keyof ExecucaoPatch }> = {
  catalogo: { status: "catalogoStatus", resultado: "catalogoResultado", erro: "catalogoErro" },
  pedidos: { status: "pedidosStatus", resultado: "pedidosResultado", erro: "pedidosErro" },
  anuncios: { status: "anunciosStatus", resultado: "anunciosResultado", erro: "anunciosErro" },
  avaliacoes: { status: "avaliacoesStatus", resultado: "avaliacoesResultado", erro: "avaliacoesErro" },
  reputacao: { status: "reputacaoStatus", resultado: "reputacaoResultado", erro: "reputacaoErro" },
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
 *  (não é lote noturno como A24: é "clicou, quero ver andando agora"). */
export const A31_sincronizarConta = inngest.createFunction(
  {
    id: "A31-sincronizar-conta",
    name: "A31 — Sincronização manual de conta (fila completa)",
    idempotency: "event.data.execucaoId",
    triggers: [{ event: "canal/sincronizacao.solicitada" }],
  },
  async ({ event, step }) => {
    const { orgId, channelAccountId, execucaoId, desde, modulos } = event.data as {
      orgId: string;
      channelAccountId: string;
      execucaoId: string;
      desde?: string;
      modulos?: ModuloSincronizacao[];
    };
    const solicitados = new Set<ModuloSincronizacao>(
      modulos?.length ? modulos.filter((item) => MODULOS_SINCRONIZACAO.includes(item)) : MODULOS_SINCRONIZACAO,
    );

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
      const completo = resultado && typeof resultado === "object"
        ? { ...resultado, progresso: 100 }
        : { valor: resultado, progresso: 100 };
      return patchStatus(modulo, "concluido", { [COLUNAS[modulo].resultado]: completo } as ExecucaoPatch);
    }

    function patchErro(modulo: ModuloSincronizacao, error: unknown): ExecucaoPatch {
      return patchStatus(modulo, "erro", { [COLUNAS[modulo].erro]: erroLegivel(error) } as ExecucaoPatch);
    }

    async function atualizarProgresso(modulo: ModuloSincronizacao, progresso: number, detalhe: Record<string, unknown> = {}) {
      await atualizarExecucao({
        [COLUNAS[modulo].resultado]: {
          ...detalhe,
          progresso: Math.max(1, Math.min(99, Math.round(progresso))),
        },
      } as ExecucaoPatch);
    }

    async function executarModulo(modulo: ModuloSincronizacao, trabalho: () => Promise<unknown>): Promise<{ ok: true; resultado: unknown } | { ok: false; erro: string }> {
      return executarModuloEm(modulo, (corpo) => step.run(modulo, corpo), trabalho);
    }

    /** Variante para módulo que se divide em vários `step.run` por dentro: o
     *  corpo roda FORA de um step (Inngest não permite step aninhado), então
     *  cada pedaço vira seu próprio step, com seu próprio orçamento de tempo.
     *
     *  Existe por causa de um loop real em produção (25/08/2026): "pedidos"
     *  fazia a varredura de 90 dias e a ingestão de 50+ pedidos dentro de UM
     *  step só. O step estourava o tempo máximo da função (Vercel), o Inngest
     *  reexecutava do zero, e a conta ficava refazendo a busca inteira a cada
     *  ~6 minutos — sem nunca terminar e queimando a cota do proxy de IP fixo.
     *  Em step pequeno o que já concluiu fica memoizado e não é refeito. */
    async function executarModuloEmSteps(modulo: ModuloSincronizacao, trabalho: () => Promise<unknown>) {
      return executarModuloEm(modulo, (corpo) => corpo(), trabalho);
    }

    async function executarModuloEm(
      modulo: ModuloSincronizacao,
      executar: (corpo: () => Promise<unknown>) => Promise<unknown>,
      trabalho: () => Promise<unknown>,
    ): Promise<{ ok: true; resultado: unknown } | { ok: false; erro: string }> {
      await step.run(`${modulo}-em-andamento`, () => atualizarExecucao(patchStatus(modulo, "em_andamento", {
        [COLUNAS[modulo].resultado]: { progresso: 1 },
      } as ExecucaoPatch)));
      try {
        const resultado = await executar(trabalho);
        await step.run(`${modulo}-concluido`, () => atualizarExecucao(patchResultado(modulo, resultado)));
        return { ok: true, resultado };
      } catch (error) {
        await step.run(`${modulo}-erro`, () => atualizarExecucao(patchErro(modulo, error)));
        return { ok: false, erro: erroLegivel(error) };
      }
    }

    // Em fatias, uma por step: catálogo grande não cabe num step só e era morto
    // pelo tempo limite, reexecutando do zero pra sempre — ver o comentário em
    // importar-catalogo.service.ts (KARZI concluía, WUWU e ARMARINHOS não).
    if (solicitados.has("catalogo")) await executarModuloEmSteps("catalogo", async () => {
      if (conta.tipo !== "mercadolivre" && conta.tipo !== "shopee") {
        return { produtosCriados: 0, ignorados: 0, ...semSuporte("Catálogo", conta.tipo) };
      }
      const contaImport = await step.run("catalogo-conta", () =>
        resolverContaParaImportar(ctx, channelAccountId, conta.tipo as "mercadolivre" | "shopee"),
      );
      let produtosCriados = 0;
      let ignorados = 0;

      if (conta.tipo === "mercadolivre") {
        let offset = 0;
        // Teto de segurança: 200 páginas de 50 = 10.000 anúncios. Sem isso, uma
        // paginação que nunca sinalize fim viraria laço infinito de steps.
        for (let pagina = 0; pagina < 200; pagina++) {
          const parcial = await step.run(`catalogo-ml-${offset}`, () =>
            importarPaginaCatalogoMercadoLivre(ctx, contaImport, offset),
          );
          produtosCriados += parcial.produtosCriados;
          ignorados += parcial.ignorados;
          const processados = Math.min(parcial.total, parcial.proximoOffset);
          await step.run(`catalogo-ml-progresso-${offset}`, () => atualizarProgresso(
            "catalogo",
            parcial.total > 0 ? 10 + (processados / parcial.total) * 85 : 95,
            { processados, total: parcial.total, produtosCriados, ignorados },
          ));
          if (parcial.fim) break;
          offset = parcial.proximoOffset;
        }
        return { produtosCriados, ignorados };
      }

      const itens = await step.run("catalogo-shopee-listar", () =>
        listarCatalogoShopeeParaImportar(contaImport),
      );
      for (let i = 0; i < itens.length; i += TAMANHO_FATIA_CATALOGO) {
        const fatia = itens.slice(i, i + TAMANHO_FATIA_CATALOGO);
        const parcial = await step.run(`catalogo-shopee-${i}`, () =>
          importarFatiaCatalogoShopee(ctx, contaImport, fatia),
        );
        produtosCriados += parcial.produtosCriados;
        ignorados += parcial.ignorados;
        await step.run(`catalogo-shopee-progresso-${i}`, () => atualizarProgresso(
          "catalogo",
          itens.length > 0 ? 10 + (Math.min(itens.length, i + fatia.length) / itens.length) * 85 : 95,
          { processados: Math.min(itens.length, i + fatia.length), total: itens.length, produtosCriados, ignorados },
        ));
      }
      return { produtosCriados, ignorados };
    });

    const resultadoPedidos = solicitados.has("pedidos")
      ? await executarModuloEmSteps("pedidos", async () => {
      // Mesmo freio do A24: app Shopee aprovado não tem permissão pra API de
      // Pedidos, reverter junto com SHOPEE_PEDIDOS_LIBERADO.
      if (conta.tipo === "shopee" && !SHOPEE_PEDIDOS_LIBERADO) {
        return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      }
      const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug ?? "");
      if (!provider) return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      const dataDesde = desde ? new Date(desde) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
      // Um step só para a busca: uma vez concluída, o Inngest memoiza o
      // resultado e uma reexecução não repete as chamadas ao canal — que é o
      // que estava queimando a cota do proxy em loop.
      const pedidos = await step.run(`pedidos-buscar-${channelAccountId}`, () => provider.buscarPedidos(dataDesde));
      await step.run("pedidos-progresso-busca", () => atualizarProgresso("pedidos", 20, {
        processados: 0,
        total: pedidos.length,
        desde: dataDesde.toISOString(),
      }));
      let novos = 0;
      // Falha de UM pedido não derruba a leva. Um pedido ruim é sempre
      // possível — anúncio removido depois da venda (ErroSkuSemProduto),
      // comprador que colide com um cadastro existente, dado que o canal
      // devolveu fora do formato. Abortar tudo no primeiro erro fazia nenhum
      // pedido entrar, inclusive os bons, e escondia os demais problemas: cada
      // sincronização revelava só o próximo erro da fila, um de cada vez.
      // Agora a leva termina e o que falhou vai no resultado, junto.
      const skusSemProduto = new Set<string>();
      const motivosDeFalha = new Set<string>();
      let ignorados = 0;
      for (let indice = 0; indice < pedidos.length; indice++) {
        const pedidoBruto = pedidos[indice];
        const pedidoNormalizado = { ...pedidoBruto, criadoEm: new Date(pedidoBruto.criadoEm) };
        // Um step por pedido, como o A24 já fazia: cada ingestão tem seu
        // próprio orçamento de tempo e fica memoizada ao concluir.
        const resultado = await step.run(
          `pedidos-ingerir-${channelAccountId}-${pedidoBruto.providerOrderId}`,
          async () => {
            try {
              const ingerido = await ingerirPedido(orgId, conta.brandId, channelAccountId, pedidoNormalizado);
              return { novo: ingerido.novo, motivo: null as string | null, skus: [] as string[] };
            } catch (error) {
              return {
                novo: false,
                motivo: erroLegivel(error).slice(0, 200),
                skus: ehErroSkuSemProduto(error) ? error.skus ?? [] : [],
              };
            }
          },
        );
        if (resultado.motivo) {
          ignorados += 1;
          motivosDeFalha.add(resultado.motivo);
          for (const sku of resultado.skus) skusSemProduto.add(sku);
        } else if (resultado.novo) {
          novos += 1;
        }
        const processados = indice + 1;
        if (processados === pedidos.length || processados % 10 === 0) {
          await step.run(`pedidos-progresso-${processados}`, () => atualizarProgresso(
            "pedidos",
            pedidos.length > 0 ? 20 + (processados / pedidos.length) * 75 : 95,
            { processados, total: pedidos.length, novos, ignorados, desde: dataDesde.toISOString() },
          ));
        }
      }
      // Se NENHUM pedido entrou e todos falharam, o problema não é "um pedido
      // ruim" — é sistêmico (credencial, banco, formato do canal). Aí sim o
      // módulo falha, pra não reportar sucesso em cima de uma leva vazia.
      if (pedidos.length > 0 && ignorados === pedidos.length) {
        throw new Error(
          `Nenhum dos ${pedidos.length} pedido(s) pôde ser importado: ${[...motivosDeFalha].join(" | ")}`,
        );
      }
      return {
        encontrados: pedidos.length,
        novos,
        ...(ignorados > 0
          ? {
            ignorados,
            motivos: [...motivosDeFalha],
            ...(skusSemProduto.size > 0 ? { skusSemProduto: [...skusSemProduto] } : {}),
          }
          : {}),
      };
    })
      : null;
    if (resultadoPedidos && !resultadoPedidos.ok) {
      await emitirEvento({
        tipo: "canal.degradado",
        orgId,
        brandId: conta.brandId,
        entidade: "channel_account",
        entidadeId: channelAccountId,
        payload: { motivo: "falha-sincronizacao-manual-pedidos", erro: resultadoPedidos.erro },
      });
    }

    if (solicitados.has("anuncios")) await executarModulo("anuncios", async () => {
      await atualizarProgresso("anuncios", 15, { etapa: "consultando_campanhas" });
      return conta.tipo === "mercadolivre"
        ? sincronizarAnunciosMercadoLivreConta(ctx, channelAccountId)
        : semSuporte("Anúncios patrocinados", conta.tipo);
    });

    if (solicitados.has("avaliacoes")) await executarModuloEmSteps("avaliacoes", async () => {
      // Shopee pagina por cursor sobre a loja inteira (teto de 10 páginas), é
      // barato e cabe num step. O ML custa uma requisição por anúncio, então vai
      // fatiado — ver o comentário em avaliacoes.service.ts.
      if (conta.tipo === "shopee") {
        await atualizarProgresso("avaliacoes", 15, { etapa: "consultando_opinioes" });
        return step.run("avaliacoes-shopee", () => sincronizarAvaliacoesShopeeConta(orgId, channelAccountId));
      }
      if (conta.tipo !== "mercadolivre") return semSuporte("Avaliações", conta.tipo);

      const listingIds: string[] = [];
      let anunciosSincronizados = 0;
      let offset = 0;
      for (let pagina = 0; pagina < 200; pagina++) {
        const parcial = await step.run(`avaliacoes-ml-${offset}`, () =>
          sincronizarPaginaAvaliacoesMercadoLivre(orgId, channelAccountId, offset),
        );
        listingIds.push(...parcial.listingIds);
        anunciosSincronizados += parcial.sincronizados;
        await step.run(`avaliacoes-ml-progresso-${offset}`, () => atualizarProgresso(
          "avaliacoes",
          parcial.fim ? 95 : Math.min(90, 10 + (pagina + 1) * 4),
          { processados: anunciosSincronizados, etapa: "consultando_anuncios" },
        ));
        if (parcial.fim) break;
        offset = parcial.proximoOffset;
      }
      const limpeza = await step.run("avaliacoes-ml-limpar", () =>
        limparAvaliacoesForaDoCatalogoMercadoLivre(orgId, channelAccountId, listingIds),
      );
      return { contasVerificadas: 1, anunciosSincronizados, removidos: limpeza.removidos };
    });

    if (solicitados.has("reputacao")) await executarModulo("reputacao", async () => {
      await atualizarProgresso("reputacao", 20, { etapa: "consultando_saude_da_loja" });
      // Shopee tem saúde de loja própria (account_health), com permissão já
      // concedida ao app de catálogo — confirmado ao vivo em 25/08/2026. O
      // formato é diferente do termômetro do ML (métricas com alvo próprio, em
      // vez de faixa de 1 a 5), então é reportado no vocabulário da Shopee, sem
      // traduzir uma escala na outra.
      if (conta.tipo === "shopee") {
        if (!conta.brandSlug || !isBrandSlug(conta.brandSlug)) {
          return semSuporte("Reputação/Termômetro", conta.tipo);
        }
        const provider = await criarShopeeProvider(conta.brandSlug);
        const desempenho = await provider.obterDesempenhoLoja();
        const foraDaMeta = desempenho.metricas.filter((m) => m.foraDaMeta);
        return {
          rating: desempenho.rating,
          metricas: desempenho.metricas.length,
          metricasForaDaMeta: foraDaMeta.length,
          piores: foraDaMeta.map((m) => `${m.nome}: ${m.valor}${m.ehPercentual ? "%" : ""} (meta ${m.comparador} ${m.alvo}${m.ehPercentual ? "%" : ""})`),
          falhas: {
            entrega: desempenho.falhasEntrega,
            anuncio: desempenho.falhasAnuncio,
            atendimento: desempenho.falhasAtendimento,
          },
        };
      }
      if (conta.tipo !== "mercadolivre") return semSuporte("Reputação/Termômetro", conta.tipo);
      const resultado = await obterReputacao(ctx, { channelAccountId, ignorarCache: true });
      const marca = resultado.marcas[0];
      return {
        marcas: resultado.marcas.length,
        marcasComFalha: resultado.marcasComFalha,
        termometro: marca?.faixaLabel ?? null,
        vendasConcluidas: marca?.vendasConcluidas ?? null,
        semContaConectada: resultado.semContaConectada,
        // A interface de Métricas lê esta fotografia do banco. Assim, abrir
        // a tela e trocar filtros nunca dispara uma nova chamada ao ML.
        reputacao: marca ?? null,
      };
    });

    await step.run("finalizar-execucao", () =>
      atualizarExecucao({ finalizadoEm: new Date() }),
    );

    return { execucaoId };
  },
);
