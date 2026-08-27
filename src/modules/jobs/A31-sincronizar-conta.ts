import { eq } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import {
  importarFatiaCatalogoShopee,
  importarPaginaCatalogoMercadoLivre,
  listarCatalogoShopeeParaImportar,
  resolverContaParaImportar,
  resumirDiagnosticoShopee,
  TAMANHO_FATIA_CATALOGO,
} from "@/modules/estoque/application/importar-catalogo.service";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { ehErroSkuSemProduto } from "@/modules/canais/domain/errors";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { criarShopeeProvider, ShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import { emitirEvento } from "@/shared/events";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { sincronizarAnunciosMercadoLivreConta } from "@/modules/anuncios/application/sincronizacao.service";
import { sincronizarAnunciosShopeeConta } from "@/modules/anuncios/application/sincronizacao-shopee.service";
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

/** As duas sincronizações de Publicidade isolam falha POR MARCA: em vez de
 *  lançar, devolvem `{ status: "erro", mensagem }` para que uma marca ruim não
 *  derrube as outras. Só que `executarModuloEm` marca o módulo como concluído
 *  sempre que o trabalho não lança — então a Central pintava o módulo de verde
 *  com a falha enterrada no JSON do resultado.
 *
 *  Aconteceu de verdade em 27/08/2026: a coleta da Shopee foi recusada com
 *  `error_date_in_future` e a tela dizia "Sincronização completa". Aqui a
 *  falha volta a ser exceção, que é o que a Central sabe mostrar.
 *
 *  `publicidade_nao_habilitada` NÃO é erro: é conta que simplesmente não usa
 *  publicidade, e pintar isso de vermelho todo dia treinaria a ignorar o
 *  vermelho. */
function falharSeColetaDeuErro<T extends { status: string; mensagem?: string; brandSlug?: string }>(resultado: T): T {
  if (resultado.status === "erro") {
    throw new Error(
      `Publicidade${resultado.brandSlug ? ` (${resultado.brandSlug})` : ""}: ${resultado.mensagem ?? "falha não detalhada"}`,
    );
  }
  return resultado;
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

      const { itens, diagnostico } = await step.run("catalogo-shopee-listar", () =>
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
      // `aviso` fica gravado em catalogo_resultado, então o motivo de o
      // catálogo voltar menor do que deveria sobrevive à execução em vez de
      // sumir num console.error — era a informação que faltava pra saber por
      // que a ARMARINHOS LIMA importava 0 produtos.
      const aviso = resumirDiagnosticoShopee(diagnostico);
      return { produtosCriados, ignorados, diagnostico, ...(aviso ? { aviso } : {}) };
    });

    /* Pedidos fica DEFINIDO aqui e é EXECUTADO por último (ver a chamada
       depois de Reputação).
     *
     *  A fila é sequencial: quando Pedidos empacava, a função inteira parava
     *  nele e Anúncios, Avaliações e Termômetro nunca saíam de `pendente` —
     *  trinta minutos depois o varredor marcava os três como "Falhou" sem que
     *  tivessem tentado uma única vez. Foi o que a Central mostrou o dia
     *  inteiro em 27/08/2026: quatro módulos vermelhos, e só o Catálogo verde,
     *  porque Catálogo roda ANTES de Pedidos.
     *
     *  Pedidos é de longe o mais pesado — 1073 pedidos numa loja como a WUWU,
     *  contra uma chamada só nos outros. Deixando-o por último, se ele morrer
     *  morre sozinho, e os outros quatro já concluíram. */
    const executarPedidos = () => solicitados.has("pedidos")
      ? executarModuloEmSteps("pedidos", async () => {
      // Mesmo freio do A24: app Shopee aprovado não tem permissão pra API de
      // Pedidos, reverter junto com SHOPEE_PEDIDOS_LIBERADO.
      if (conta.tipo === "shopee" && !SHOPEE_PEDIDOS_LIBERADO) {
        return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      }
      const provider = await resolverChannelProvider(conta.tipo, conta.brandSlug ?? "");
      if (!provider) return { encontrados: 0, novos: 0, ...semSuporte("Pedidos", conta.tipo) };
      const dataDesde = desde ? new Date(desde) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000);
      // A busca fica memoizada por step: concluído um, uma reexecução não
      // repete aquelas chamadas ao canal — era o que queimava a cota do proxy
      // em laço.
      //
      // Na Shopee, um step por janela de 15 dias em vez de um step para os 90
      // dias inteiros. O step único não cabia nos 300s de `maxDuration` numa
      // loja com volume (WUWU: 1073 pedidos em 90 dias, cada um pedindo
      // `get_order_detail` pelo proxy): estourava, o Inngest reexecutava do
      // zero e a execução ficava presa em `em_andamento` para sempre — o
      // varredor de abandonadas marcava Pedidos como falha e Anúncios,
      // Avaliações e Termômetro nem chegavam a rodar, porque a fila é
      // sequencial. E memoização só vale para step que TERMINA: o step único,
      // que existia para poupar a cota, era justamente quem a queimava.
      // Mesma correção já aplicada ao catálogo da Shopee, que fatia e conclui.
      //
      // Reaproveita o provider que `resolverChannelProvider` já criou em vez
      // de chamar `criarShopeeProvider` de novo: aquela chamada resolve
      // credencial, e este bloco roda fora de step — ou seja, a cada
      // reinvocação da função pelo Inngest. Duas resoluções por invocação
      // dobravam a chance de cair na janela de renovação do token, onde o
      // provider recusa o token do banco e lança "token OAuth expirado".
      const providerShopee = conta.tipo === "shopee" && provider instanceof ShopeeProvider
        ? provider
        : null;
      // Sem anotação de tipo de propósito: o Inngest serializa entre steps e
      // `criadoEm` volta como string, não Date. Quem normaliza é o laço de
      // ingestão logo abaixo (`new Date(pedidoBruto.criadoEm)`).
      const pedidos = providerShopee
        ? await (async () => {
          const acumulado = [];
          for (const [indice, janela] of providerShopee.janelasDePedidos(dataDesde).entries()) {
            const daJanela = await step.run(
              `pedidos-buscar-${channelAccountId}-janela-${indice}`,
              () => providerShopee.buscarPedidosDaJanela(janela.inicioMs, janela.fimMs),
            );
            acumulado.push(...daJanela);
          }
          return acumulado;
        })()
        : await step.run(`pedidos-buscar-${channelAccountId}`, () => provider.buscarPedidos(dataDesde));
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
      let falhasSemCausaConhecida = 0;
      // EM LOTE, não um step por pedido.
      //
      // O Inngest limita ~1000 steps por execução de função. Um step por
      // pedido mais um de progresso a cada dez gastava 1073 + 107 + os do
      // catálogo e das janelas: passava de mil por volta do pedido 880. Foi
      // exatamente o que aconteceu em produção em 27/08/2026 — duas execuções
      // independentes da Shopee/WUWU pararam no MESMO ponto, 880 de 1073,
      // com 288 ignorados idênticos. Não era o token nem a busca: era a
      // trava de steps, e nenhum clique em "Sincronizar" ia passar dali.
      //
      // Um step por lote de 25 derruba o gasto para ~45 steps na mesma leva.
      // Cada lote leva uns 75s (≈3s por pedido, quase tudo latência de banco
      // entre regiões), bem dentro dos 300s de `maxDuration`. Reexecutar um
      // lote é seguro: `ingerirPedido` é idempotente — reconhece o pedido já
      // importado por `providerOrderId` e não duplica.
      const TAMANHO_LOTE_PEDIDOS = 25;
      for (let inicio = 0; inicio < pedidos.length; inicio += TAMANHO_LOTE_PEDIDOS) {
        const lote = pedidos.slice(inicio, inicio + TAMANHO_LOTE_PEDIDOS);
        const parcial = await step.run(
          `pedidos-ingerir-${channelAccountId}-lote-${inicio}`,
          async () => {
            const saida = {
              novos: 0,
              ignorados: 0,
              falhasSemCausaConhecida: 0,
              motivos: [] as string[],
              skus: [] as string[],
            };
            for (const pedidoBruto of lote) {
              const pedidoNormalizado = { ...pedidoBruto, criadoEm: new Date(pedidoBruto.criadoEm) };
              try {
                const ingerido = await ingerirPedido(orgId, conta.brandId, channelAccountId, pedidoNormalizado);
                if (ingerido.novo) saida.novos += 1;
              } catch (error) {
                // Falha de UM pedido não derruba o lote, do mesmo jeito que
                // antes não derrubava a leva.
                saida.ignorados += 1;
                if (!ehErroSkuSemProduto(error)) saida.falhasSemCausaConhecida += 1;
                const motivo = erroLegivel(error).slice(0, 200);
                if (!saida.motivos.includes(motivo)) saida.motivos.push(motivo);
                if (ehErroSkuSemProduto(error)) {
                  for (const sku of error.skus ?? []) if (!saida.skus.includes(sku)) saida.skus.push(sku);
                }
              }
            }
            return saida;
          },
        );
        novos += parcial.novos;
        ignorados += parcial.ignorados;
        falhasSemCausaConhecida += parcial.falhasSemCausaConhecida;
        for (const motivo of parcial.motivos) motivosDeFalha.add(motivo);
        for (const sku of parcial.skus) skusSemProduto.add(sku);

        const processados = Math.min(inicio + lote.length, pedidos.length);
        await step.run(`pedidos-progresso-${processados}`, () => atualizarProgresso(
          "pedidos",
          pedidos.length > 0 ? 20 + (processados / pedidos.length) * 75 : 95,
          { processados, total: pedidos.length, novos, ignorados, desde: dataDesde.toISOString() },
        ));
      }
      // Se NENHUM pedido entrou e todos falharam, o problema PODE ser
      // sistêmico (credencial, banco, formato do canal). Só que "todos"
      // engana quando a leva é pequena: com um pedido só na janela, um SKU
      // sem produto na marca virava 100% de falha e derrubava a conta
      // inteira, com um alerta vermelho de "Shopee não respondeu" pra algo
      // que a Shopee respondeu perfeitamente. Aconteceu de verdade em
      // 26/08/2026 na ARMARINHOS LIMA. Por isso o freio exige ao menos uma
      // falha SEM causa conhecida: quando toda a leva parou em erro de
      // pedido (ErroSkuSemProduto), isso é `ignorados`, não falha da conta.
      if (pedidos.length > 0 && ignorados === pedidos.length && falhasSemCausaConhecida > 0) {
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
      : Promise.resolve(null);

    if (solicitados.has("anuncios")) await executarModulo("anuncios", async () => {
      await atualizarProgresso("anuncios", 15, { etapa: "consultando_campanhas" });
      if (conta.tipo === "mercadolivre") {
        return falharSeColetaDeuErro(await sincronizarAnunciosMercadoLivreConta(ctx, channelAccountId));
      }
      // Shopee: app de Ads próprio, autorização separada da do catálogo. Uma
      // marca com a loja conectada mas sem esse app autorizado cai no erro de
      // credencial ausente vindo de criarShopeeAdsProvider — que é o que o
      // operador precisa ler pra saber que falta clicar em Conectar.
      if (conta.tipo === "shopee") {
        return falharSeColetaDeuErro(await sincronizarAnunciosShopeeConta(ctx, channelAccountId));
      }
      return semSuporte("Anúncios patrocinados", conta.tipo);
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

    // POR ÚLTIMO, de propósito (ver a definição de `executarPedidos`): é o
    // módulo pesado, e agora os quatro leves já concluíram antes dele.
    const resultadoPedidos = await executarPedidos();
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

    await step.run("finalizar-execucao", () =>
      atualizarExecucao({ finalizadoEm: new Date() }),
    );

    return { execucaoId };
  },
);
