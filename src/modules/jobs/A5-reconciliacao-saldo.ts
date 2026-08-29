import { and, eq, inArray, sql } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, estoqueCanalSaldo, produto, produtoCanal } from "@/shared/lib/db/schema";
import { emitirEvento, emitirEventoUnico } from "@/shared/events";
import { resolverChannelProvider } from "@/modules/canais/infrastructure/provider-resolver";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { criarShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";
import { isBrandSlug } from "@/shared/config/brands";
import { registrarVerificacaoCanal } from "@/modules/canais/application/verificacao-canal.service";

/** Quanto tempo o anúncio precisa ficar "closed"/não encontrado, sem
 *  interrupção, antes do produto ser desativado de verdade. Uma execução
 *  isolada não conta — API do ML pode ter um soluço, ou o vendedor reabre
 *  o anúncio horas depois.
 *
 *  A comparação é contra tempo real decorrido (`mlEncerradoDesde`), não contra
 *  número de rodadas, então continua valendo se o intervalo do A5 mudar — só
 *  precisa caber mais de uma rodada em 24h, o que INTERVALO_COLETA_HORAS
 *  garante com folga. */
const HORAS_PARA_DESATIVAR = 24;

/** De quanto em quanto tempo o espelho do anúncio na Shopee (status, preço,
 *  foto, link) é reconsultado. Não é de hora em hora como o saldo: esses
 *  campos mudam devagar, e a cota do proxy da Shopee é o recurso escasso da
 *  integração (ver o topo de shopee.provider.ts). */
const HORAS_ENTRE_ESPELHOS_SHOPEE = 6;

/** De quantas em quantas horas a varredura completa roda.
 *
 *  Era de hora em hora. O que mudou o cálculo foi a cota do proxy de IP fixo
 *  da Shopee (Webshare, 1GB/mês), que é o recurso escasso da integração: cada
 *  varredura gasta ~83 chamadas de `get_model_list` só de Shopee, o que dava
 *  ~2.000 chamadas por dia — de longe o maior consumidor depois que o A24 foi
 *  espaçado em 25/08/2026.
 *
 *  Quatro vezes ao dia é rede de segurança, não o caminho principal: mudança
 *  de saldo por venda já é recoletada na hora pelo A29 (recoleta-por-venda).
 *  O que esta varredura pega é o que muda fora de venda — edição de estoque
 *  feita direto no painel do canal — e aí algumas horas de atraso é aceitável.
 *  O custo de aumentar de novo é só trocar este número. */
const INTERVALO_COLETA_HORAS = 6;

/** Quantos mapeamentos cada passo do Inngest processa de uma vez.
 *
 *  O tamanho vem do custo de um passo: cada `step.run` é uma ida e volta HTTP
 *  própria, então um passo por anúncio transformava uma coleta de segundos em
 *  dezenas de horas. Em lotes, o número de passos cai de ~550 para ~11, e cada
 *  lote ainda cabe folgado no tempo limite de execução. */
const TAMANHO_DO_LOTE = 50;

type FalhaColeta = {
  listingId: string;
  channelAccountId: string;
  brandId: string;
  tipo: string;
  erro: string;
};

export const A5_coletaSaldoCanais = inngest.createFunction(
  {
    id: "A5-reconciliacao-saldo",
    name: `A5 — Coleta de saldo de estoque por canal (a cada ${INTERVALO_COLETA_HORAS}h)`,
    concurrency: { limit: 1 },
    // Uma varredura completa custa ~20s e ~550 chamadas somando os canais.
    // Pelo lado do Mercado Livre isso nunca foi o problema (perto de 3% do teto
    // horário da aplicação); o limite que pesa é a cota do proxy da Shopee —
    // ver INTERVALO_COLETA_HORAS. Consequência a ter em mente: o alerta de
    // mínimo passa a ter, no pior caso, o intervalo de atraso.
    triggers: [{ cron: `0 */${INTERVALO_COLETA_HORAS} * * *` }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const mapeamentos = await step.run("buscar-mapeamentos", () =>
      db
        .select({
          produtoCanalId: produtoCanal.id,
          produtoId: produtoCanal.produtoId,
          externalListingId: produtoCanal.externalListingId,
          externalSkuId: produtoCanal.externalSkuId,
          externalWarehouseId: produtoCanal.externalWarehouseId,
          channelAccountId: channelAccount.id,
          tipo: channelAccount.tipo,
          status: channelAccount.status,
          brandId: channelAccount.brandId,
          brandSlug: brand.slug,
          mlEncerradoDesde: produtoCanal.mlEncerradoDesde,
          statusVerificadoEm: produtoCanal.statusVerificadoEm,
        })
        .from(produtoCanal)
        .innerJoin(channelAccount, and(
          eq(channelAccount.id, produtoCanal.channelAccountId),
          eq(channelAccount.orgId, produtoCanal.orgId),
        ))
        .innerJoin(brand, and(
          eq(brand.id, channelAccount.brandId),
          eq(brand.orgId, channelAccount.orgId),
        ))
        .where(and(
          eq(produtoCanal.orgId, orgId),
          eq(produtoCanal.ativo, true),
        )),
    );

    const conectados = mapeamentos.filter((item) => item.status === "conectado");
    const desconectados = mapeamentos.length - conectados.length;

    const lotes: (typeof conectados)[] = [];
    for (let i = 0; i < conectados.length; i += TAMANHO_DO_LOTE) {
      lotes.push(conectados.slice(i, i + TAMANHO_DO_LOTE));
    }

    let coletados = 0;
    const falhas: FalhaColeta[] = [];

    for (const [indice, lote] of lotes.entries()) {
      const resultado = await step.run(`coletar-lote-${indice}`, async () => {
        const providers = new Map<string, ReturnType<typeof resolverChannelProvider>>();
        // Em paralelo dentro do lote: o provider do Mercado Livre já limita as
        // chamadas simultâneas e faz backoff pelo Retry-After, então não há
        // risco de estourar o teto disparando o lote de uma vez.
        const saldos = await Promise.all(lote.map(async (item) => {
          try {
            let providerPromise = providers.get(item.channelAccountId);
            if (!providerPromise) {
              providerPromise = resolverChannelProvider(item.tipo, item.brandSlug);
              providers.set(item.channelAccountId, providerPromise);
            }
            const provider = await providerPromise;
            if (!provider) throw new Error(`Provider ${item.tipo}/${item.brandSlug} não suportado.`);
            const saldo = await provider.consultarEstoque({
              listingId: item.externalListingId,
              skuId: item.externalSkuId,
              warehouseId: item.externalWarehouseId,
            });
            return { item, saldo, erro: null as string | null };
          } catch (error) {
            return { item, saldo: null, erro: String(error) };
          }
        }));

        const linhas = saldos
          .filter((linha): linha is typeof linha & { saldo: number } => linha.saldo !== null)
          .map((linha) => ({
            orgId,
            produtoId: linha.item.produtoId,
            channelAccountId: linha.item.channelAccountId,
            produtoCanalId: linha.item.produtoCanalId,
            saldo: linha.saldo,
            verificadoEm: new Date(),
          }));

        // Uma escrita por lote em vez de uma por anúncio: mesma economia de
        // ida e volta que motivou o lote na chamada ao canal.
        if (linhas.length > 0) {
          await db
            .insert(estoqueCanalSaldo)
            .values(linhas)
            .onConflictDoUpdate({
              target: estoqueCanalSaldo.produtoCanalId,
              set: {
                saldo: sql`excluded.saldo`,
                verificadoEm: sql`excluded.verificado_em`,
              },
            });
        }

        return {
          gravados: linhas.length,
          falhas: saldos
            .filter((linha) => linha.erro)
            .map((linha) => ({
              listingId: linha.item.externalListingId,
              channelAccountId: linha.item.channelAccountId,
              brandId: linha.item.brandId,
              tipo: linha.item.tipo,
              erro: linha.erro as string,
            })),
        };
      });

      coletados += resultado.gravados;
      falhas.push(...resultado.falhas);
    }

    // ── Status do anúncio no ML (ativo/pausado/encerrado) ──────────────
    // O saldo sozinho não "avisa" quando um anúncio deixa de existir — ele
    // só fica congelado no último valor coletado, pra sempre. Isso é
    // separado da coleta de saldo acima porque só o Mercado Livre expõe
    // status hoje (Shopee/TikTok nem chegam a este trecho).
    const mapeamentosML = conectados.filter((item) => item.tipo === "mercadolivre" && isBrandSlug(item.brandSlug));
    let produtosDesativados = 0;
    if (mapeamentosML.length > 0) {
      await step.run("verificar-status-anuncios-ml", async () => {
        const porMarca = new Map<string, typeof mapeamentosML>();
        for (const item of mapeamentosML) {
          porMarca.set(item.brandSlug, [...(porMarca.get(item.brandSlug) ?? []), item]);
        }

        const agora = Date.now();
        const idsParaEncerrarAgora: string[] = [];
        const idsParaRecuperar: string[] = [];
        const produtoCanalIdsParaDesativar: string[] = [];
        const produtoIdsParaDesativar: string[] = [];
        const statusParaPersistir = new Map<string, {
          status: string;
          subStatus: string | null;
          ids: string[];
        }>();

        await Promise.all([...porMarca].map(async ([marcaSlug, itens]) => {
          try {
            const provider = await criarMLProvider(marcaSlug as Parameters<typeof criarMLProvider>[0]);
            const status = await provider.consultarStatusAnuncios(itens.map((item) => item.externalListingId));
            for (const item of itens) {
              const info = status[item.externalListingId];
              // Sem resposta (falha pontual da consulta) não conta nem pra um
              // lado nem pro outro — não é sinal de nada, só ruído da rede.
              if (!info) continue;
              const subStatus = info.subStatus[0] ?? null;
              const chaveStatus = `${info.status}\u0000${subStatus ?? ""}`;
              const grupo = statusParaPersistir.get(chaveStatus) ?? {
                status: info.status,
                subStatus,
                ids: [],
              };
              grupo.ids.push(item.produtoCanalId);
              statusParaPersistir.set(chaveStatus, grupo);

              const encerrado = info.status === "closed" || info.status === "nao_encontrado";
              if (encerrado) {
                if (item.mlEncerradoDesde === null) {
                  idsParaEncerrarAgora.push(item.produtoCanalId);
                  // `step.run` serializa o resultado da busca em JSON (é assim que o
                  // Inngest torna o passo durável/repetível) — datas voltam como
                  // string ISO, não como `Date`, daí o `new Date(...)` aqui.
                } else if (agora - new Date(item.mlEncerradoDesde).getTime() >= HORAS_PARA_DESATIVAR * 3_600_000) {
                  produtoCanalIdsParaDesativar.push(item.produtoCanalId);
                  produtoIdsParaDesativar.push(item.produtoId);
                }
              } else if (item.mlEncerradoDesde !== null) {
                idsParaRecuperar.push(item.produtoCanalId);
              }
            }
          } catch {
            // Marca inteira falhou (token vencido, etc.) — não afeta as outras
            // marcas, e nenhum item dela muda de estado nesta rodada.
          }
        }));

        // Poucos status possíveis significam poucas escritas (normalmente
        // ativo/pausado/encerrado), mesmo com centenas de anúncios. A data é
        // a idade que a UI pode usar para distinguir dado coletado de ausência.
        const statusVerificadoEm = new Date();
        await Promise.all([...statusParaPersistir.values()].map((grupo) =>
          db.update(produtoCanal)
            .set({
              // As duas grafias: `status_anuncio` é a coluna de canal, que
              // vale pro Mercado Livre e pra Shopee, e é a que as telas leem;
              // as `ml_*` seguem escritas durante a transição, porque a
              // migration é aplicada à mão antes do deploy e há uma janela em
              // que o código no ar ainda lê as antigas.
              statusAnuncio: grupo.status,
              statusVerificadoEm,
              mlStatusAnuncio: grupo.status,
              mlSubStatus: grupo.subStatus,
              mlStatusVerificadoEm: statusVerificadoEm,
              updatedAt: statusVerificadoEm,
            })
            .where(inArray(produtoCanal.id, grupo.ids)),
        ));

        if (idsParaEncerrarAgora.length > 0) {
          await db.update(produtoCanal)
            .set({ mlEncerradoDesde: new Date(), updatedAt: new Date() })
            .where(inArray(produtoCanal.id, idsParaEncerrarAgora));
        }
        if (idsParaRecuperar.length > 0) {
          await db.update(produtoCanal)
            .set({ mlEncerradoDesde: null, updatedAt: new Date() })
            .where(inArray(produtoCanal.id, idsParaRecuperar));
        }
        if (produtoCanalIdsParaDesativar.length > 0) {
          await db.update(produtoCanal)
            .set({ ativo: false, updatedAt: new Date() })
            .where(inArray(produtoCanal.id, produtoCanalIdsParaDesativar));
          await db.update(produto)
            .set({ ativo: false, updatedAt: new Date() })
            .where(inArray(produto.id, produtoIdsParaDesativar));
          produtosDesativados = produtoIdsParaDesativar.length;

          await emitirEvento({
            tipo: "produto.desativado_automaticamente",
            orgId,
            entidade: "produto",
            entidadeId: produtoIdsParaDesativar[0],
            payload: {
              motivo: `Anúncio encerrado/não encontrado no Mercado Livre por ${HORAS_PARA_DESATIVAR}h seguidas`,
              produtoIds: produtoIdsParaDesativar,
            },
          });
        }
      });
    }

    /* ── Espelho do anúncio na Shopee ──────────────────────────────────
       Status, preço anunciado, foto e link. Os quatro apareciam preenchidos
       no Mercado Livre e vazios na Shopee (133 vínculos sem status nenhum,
       contra 656 de 658 no ML) — não porque a Shopee não informe, mas porque
       a chamada que já fazíamos pedia só o nome do item.

       Não desativa produto nem marca anúncio como encerrado, ao contrário do
       trecho do Mercado Livre acima: aquilo depende de uma régua de 24h de
       "encerrado" que a Shopee expressa de outro jeito ("UNLIST", "BANNED",
       "DELETED"), e desativar catálogo com base numa tradução ainda não
       verificada ao vivo seria arriscar apagar produto vendável. Aqui só se
       registra o que o canal respondeu. */
    const mapeamentosShopee = conectados.filter((item) => item.tipo === "shopee" && isBrandSlug(item.brandSlug));
    let anunciosShopeeEspelhados = 0;
    if (mapeamentosShopee.length > 0) {
      anunciosShopeeEspelhados = await step.run("espelhar-anuncios-shopee", async () => {
        const agora = Date.now();
        const pendentes = mapeamentosShopee.filter((item) => (
          !item.statusVerificadoEm
          || agora - new Date(item.statusVerificadoEm).getTime() >= HORAS_ENTRE_ESPELHOS_SHOPEE * 3_600_000
        ));
        if (pendentes.length === 0) return 0;

        const porMarca = new Map<string, typeof pendentes>();
        for (const item of pendentes) {
          porMarca.set(item.brandSlug, [...(porMarca.get(item.brandSlug) ?? []), item]);
        }

        let espelhados = 0;
        for (const [marcaSlug, itens] of porMarca) {
          try {
            const provider = await criarShopeeProvider(marcaSlug as Parameters<typeof criarShopeeProvider>[0]);
            const detalhes = await provider.consultarStatusAnuncios(itens.map((item) => item.externalListingId));
            const verificadoEm = new Date();
            await Promise.all(itens.map(async (item) => {
              const detalhe = detalhes[item.externalListingId];
              // Sem resposta pra este anúncio é "não sei agora", nunca
              // "sumiu" — mesmo critério do trecho do Mercado Livre.
              if (!detalhe) return;
              await db.update(produtoCanal)
                .set({
                  statusAnuncio: detalhe.status,
                  statusVerificadoEm: verificadoEm,
                  precoAnuncio: detalhe.preco,
                  imagemUrl: detalhe.imagem,
                  permalink: detalhe.permalink,
                  updatedAt: verificadoEm,
                })
                .where(eq(produtoCanal.id, item.produtoCanalId));
              espelhados += 1;
            }));
          } catch {
            // Marca inteira falhou (token vencido, proxy fora) — as outras
            // seguem, e o saldo já coletado acima não é afetado.
          }
        }
        return espelhados;
      });
    }

    // Falha isolada não derruba a coleta. Um anúncio com dado inconsistente do
    // lado do canal é permanente: se ele fizesse o job falhar, a execução seria
    // repetida sem parar e a coleta nunca fecharia uma volta. Só é tratado como
    // erro quando nada foi coletado, o que aponta para causa sistêmica —
    // credencial vencida, canal fora do ar.
    if (falhas.length > 0) {
      // Cada conta recebe seu próprio evento. Antes, todas as falhas eram
      // atribuídas à primeira conta conectada, mesmo quando ela estava
      // saudável; isso também tornava a chave de deduplicação incorreta.
      const falhasPorConta = new Map<string, FalhaColeta[]>();
      for (const falha of falhas) {
        const grupo = falhasPorConta.get(falha.channelAccountId) ?? [];
        grupo.push(falha);
        falhasPorConta.set(falha.channelAccountId, grupo);
      }

      for (const [channelAccountId, itens] of falhasPorConta) {
        const primeira = itens[0];
        await emitirEventoUnico({
          tipo: "canal.degradado",
          orgId,
          brandId: primeira.brandId,
          entidade: "channel_account",
          entidadeId: channelAccountId,
          payload: {
            motivo: "falha-coleta-estoque",
            tipo: primeira.tipo,
            totalFalhas: itens.length,
            ultimoErro: primeira.erro,
            exemplos: itens.slice(0, 10),
          },
        });
      }
    }

    /* Saldo e espelho do anúncio acabaram de ser conferidos: é isto que a
       tela de Estoque chama de "catálogo". Marcar aqui evita que abrir Estoque
       dispare uma varredura de catálogo da Shopee — a coleta mais cara que
       existe na integração — logo depois desta, que acabou de rodar. Conta que
       falhou fica de fora de propósito. */
    const contasComFalha = new Set(falhas.map((falha) => falha.channelAccountId));
    const contasConferidas = [...new Set(
      conectados.map((item) => item.channelAccountId).filter((id) => !contasComFalha.has(id)),
    )];
    if (contasConferidas.length > 0) {
      await step.run("marcar-catalogo-verificado", async () => {
        for (const channelAccountId of contasConferidas) {
          await registrarVerificacaoCanal(orgId, channelAccountId, "catalogo");
        }
        return { contas: contasConferidas.length };
      });
    }

    if (coletados === 0 && conectados.length > 0) {
      throw new Error(`A5 não coletou nenhum dos ${conectados.length} mapeamento(s) — verifique credenciais e disponibilidade do canal.`);
    }

    return {
      coletados,
      falhas: falhas.length,
      desconectados,
      lotes: lotes.length,
      produtosDesativados,
      anunciosShopeeEspelhados,
    };
  },
);
