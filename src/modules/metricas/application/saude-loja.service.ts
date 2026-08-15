import { and, count, eq, gt, gte, inArray, isNull, lte, ne, sql, sum } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  brand,
  estoqueCanalSaldo,
  mlAvaliacaoAnuncio,
  pedido,
  produto,
} from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";
import { obterAtendimento, type AtendimentoResumo } from "./atendimento.service";
import {
  LIMITE_TAXA,
  obterContasDesconectadas,
  obterReputacao,
  type ContaDesconectada,
  type ReputacaoMarca,
  type ReputacaoResultado,
} from "./reputacao.service";
import { obterReclamacoesAbertas, type ReclamacoesResultado } from "./reclamacoes.service";
import { obterMargemPorMarca } from "./margem.service";
import { obterCrescimentoPorMarca } from "./crescimento.service";

/* ── Score de Saúde da Loja ──────────────────────────────────────
   Cálculo 100% nosso — nenhuma chamada nova a canal nenhum, só a
   composição do que já sabemos. A regra que sustenta o número é:
   nota inventada é pior que nota ausente. Um pilar sem dado não vira
   zero nem 50; ele sai da conta, e o peso dele é redistribuído entre
   os que têm dado. O resultado carrega junto quantos pilares de fato
   entraram (`pilaresMedidos`), para a tela poder dizer "parcial" em
   vez de fingir precisão que não existe. */

export type ChavePilar = "reputacao" | "posVenda" | "satisfacao" | "atendimento" | "estoque";

interface PilarConfig {
  chave: ChavePilar;
  label: string;
  /** Peso relativo. Só os pilares medidos entram na normalização. */
  peso: number;
  descricao: string;
}

export const PILARES: PilarConfig[] = [
  { chave: "reputacao", label: "Reputação", peso: 30, descricao: "Termômetro do Mercado Livre" },
  { chave: "posVenda", label: "Pós-venda", peso: 25, descricao: "Reclamações, cancelamentos e atrasos" },
  { chave: "satisfacao", label: "Satisfação", peso: 20, descricao: "Nota média dos anúncios" },
  { chave: "atendimento", label: "Atendimento", peso: 15, descricao: "Resposta às mensagens" },
  { chave: "estoque", label: "Estoque", peso: 10, descricao: "Catálogo disponível e girando" },
];

export interface Pilar {
  chave: ChavePilar;
  label: string;
  descricao: string;
  peso: number;
  /** 0–100. Null quando não há dado — o pilar sai da conta em vez de virar zero. */
  nota: number | null;
  /** Frase curta que explica de onde veio a nota, para o número não ser opaco. */
  detalhe: string;
}

/** Faixas do score composto. Mesmo espírito do termômetro do ML: quem lê
 *  precisa saber se 72 é bom antes de perguntar a alguém. */
export const FAIXAS_SCORE = [
  { minimo: 85, label: "Excelente", cor: "var(--escala-5)" },
  { minimo: 70, label: "Saudável", cor: "var(--escala-4)" },
  { minimo: 50, label: "Atenção", cor: "var(--escala-3)" },
  { minimo: 30, label: "Risco", cor: "var(--escala-2)" },
  { minimo: 0, label: "Crítico", cor: "var(--escala-1)" },
] as const;

export function faixaDoScore(score: number) {
  return FAIXAS_SCORE.find((faixa) => score >= faixa.minimo) ?? FAIXAS_SCORE[FAIXAS_SCORE.length - 1];
}

export interface SaudeMarca {
  brandId: string;
  marca: string;
  marcaLabel: string;
  /** 0–100. Null quando nenhum pilar tinha dado — loja recém-conectada. */
  score: number | null;
  faixaLabel: string | null;
  faixaCor: string | null;
  pilares: Pilar[];
  /** Quantos dos 5 pilares entraram na conta. Menos que 5 = leitura parcial. */
  pilaresMedidos: number;
  /* Números crus que a comparação lado a lado usa direto, sem recalcular. */
  faturamento: number;
  faturamentoLabel: string;
  pedidos: number;
  ticketMedio: number;
  ticketMedioLabel: string;
  notaMedia: number | null;
  totalAvaliacoes: number;
  reclamacoesAbertas: number;
  emMediacao: number;
  reputacao: ReputacaoMarca | null;
  atendimento: AtendimentoResumo | null;
  /** Margem líquida sobre a receita com comissão conhecida (ver
   *  margem.service.ts) — deliberadamente fora dos 5 pilares do score: saúde
   *  operacional e rentabilidade são perguntas diferentes, e misturar as duas
   *  deixaria uma loja com margem ruim mas atendimento impecável parecendo
   *  "doente" por um motivo que os pilares não explicam. Null sem nenhum item
   *  com taxa conhecida no período. */
  margemPercentual: number | null;
  margemLiquidaLabel: string | null;
  /** 0–100: fração da receita da marca que entrou nessa conta de margem. */
  margemCoberturaPercentual: number;
  /** 0–100: fração dos pedidos do período cancelada ou devolvida. Conta sobre
   *  TODOS os pedidos (ao contrário do resto do módulo, que os exclui) —
   *  aqui é exatamente o que se quer medir. Null sem nenhum pedido no período. */
  taxaCancelamento: number | null;
  /** 0–100: quanto da receita veio dos 5 produtos mais vendidos da marca.
   *  Alto = a marca depende de poucos itens (risco se um deles faltar). */
  concentracaoTop5: number | null;
  /** 0–100: quanto da receita veio de cliente que já tinha comprado dessa
   *  marca antes do período. Null sem receita no período. */
  taxaRecorrencia: number | null;
}

export interface SaudeLojaResultado {
  marcas: SaudeMarca[];
  /** Score consolidado da operação (média ponderada pelo faturamento de cada
   *  marca — marca que fatura mais pesa mais no retrato do negócio). */
  scoreGeral: number | null;
  faixaGeralLabel: string | null;
  faixaGeralCor: string | null;
  periodoLabel: string;
  reputacaoIndisponivel: boolean;
  marcasComFalha: string[];
  /** Contas do Mercado Livre que já funcionaram e pararam (token expirado,
   *  revogado etc.) — diferente de "nunca conectou". */
  contasDesconectadas: ContaDesconectada[];
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Interpola linearmente entre dois pontos e prende o resultado em 0–100. */
function escala(valor: number, pior: number, melhor: number): number {
  if (pior === melhor) return 100;
  const bruto = ((valor - pior) / (melhor - pior)) * 100;
  return Math.round(Math.min(100, Math.max(0, bruto)));
}

/* ── Pilares ─────────────────────────────────────────────────── */

/** Termômetro 1–5 vira 0–100 direto: vermelho é 0, verde é 100. */
function pilarReputacao(reputacao: ReputacaoMarca | null): { nota: number | null; detalhe: string } {
  if (!reputacao || reputacao.faixa === null) {
    return { nota: null, detalhe: "Sem termômetro no Mercado Livre ainda" };
  }
  return {
    nota: escala(reputacao.faixa, 1, 5),
    detalhe: `Termômetro ${reputacao.faixaLabel}${reputacao.seloMercadoLider ? ` · ${reputacao.seloMercadoLider}` : ""}`,
  };
}

/** Cada taxa vale 100 quando está em zero e 0 quando bate o teto que derruba o
 *  termômetro. A nota do pilar é a média das taxas que existem. */
function pilarPosVenda(reputacao: ReputacaoMarca | null): { nota: number | null; detalhe: string } {
  const taxas = (reputacao?.taxas ?? []).filter((taxa) => taxa.valor !== null);
  if (taxas.length === 0) return { nota: null, detalhe: "Sem histórico de pós-venda no período" };

  const notas = taxas.map((taxa) => escala(taxa.valor as number, LIMITE_TAXA[taxa.chave], 0));
  const nota = Math.round(notas.reduce((soma, item) => soma + item, 0) / notas.length);
  const estouradas = taxas.filter((taxa) => taxa.estourado);
  return {
    nota,
    detalhe: estouradas.length > 0
      ? `Acima do limite: ${estouradas.map((taxa) => taxa.label.toLowerCase()).join(", ")}`
      : "Todas as taxas dentro do limite",
  };
}

/** Nota de 1 a 5 estrelas mapeada em 0–100, com o piso em 3: abaixo disso o
 *  anúncio já está afastando comprador, e tratar 3,0 como "60%" suavizaria
 *  demais um problema que é grave. */
function pilarSatisfacao(notaMedia: number | null, total: number): { nota: number | null; detalhe: string } {
  if (notaMedia === null || total === 0) {
    return { nota: null, detalhe: "Nenhum anúncio avaliado ainda" };
  }
  return {
    nota: escala(notaMedia, 3, 5),
    detalhe: `${notaMedia.toFixed(1)} ★ em ${total} avaliaç${total === 1 ? "ão" : "ões"}`,
  };
}

/** Mistura o quanto foi respondido com a rapidez: responder tudo em três dias
 *  não é atendimento bom, e responder em minutos só um terço também não. */
function pilarAtendimento(atendimento: AtendimentoResumo | null): { nota: number | null; detalhe: string } {
  if (!atendimento || atendimento.perguntas === 0 || atendimento.taxaResposta === null) {
    return { nota: null, detalhe: "Nenhuma mensagem de cliente no período" };
  }
  const notaCobertura = escala(atendimento.taxaResposta, 60, 100);
  // 24h vale 0, resposta imediata vale 100. Sem mediana (nada respondido),
  // o pilar fica só com a cobertura — que nesse caso já é baixa.
  const notaVelocidade = atendimento.medianaSegundos === null
    ? null
    : escala(atendimento.medianaSegundos, 86_400, 0);
  const nota = notaVelocidade === null
    ? notaCobertura
    : Math.round(notaCobertura * 0.5 + notaVelocidade * 0.5);
  return {
    nota,
    detalhe: atendimento.medianaLabel
      ? `${atendimento.taxaResposta}% respondidas · mediana ${atendimento.medianaLabel}`
      : `${atendimento.taxaResposta}% respondidas`,
  };
}

/** Quanto do catálogo ativo está disponível para vender. Produto sem saldo é
 *  anúncio que não converte; produto parado é capital que não gira. */
function pilarEstoque(
  ativos: number,
  comSaldo: number,
  abaixoDoMinimo: number,
): { nota: number | null; detalhe: string } {
  if (ativos === 0) return { nota: null, detalhe: "Nenhum produto ativo no catálogo" };
  const disponibilidade = (comSaldo / ativos) * 100;
  const penalidade = (abaixoDoMinimo / ativos) * 100;
  const nota = Math.round(Math.min(100, Math.max(0, disponibilidade - penalidade)));
  return {
    nota,
    detalhe: `${comSaldo} de ${ativos} com saldo${abaixoDoMinimo > 0 ? ` · ${abaixoDoMinimo} abaixo do mínimo` : ""}`,
  };
}

/** Média ponderada que ignora pilar sem dado, redistribuindo o peso dele entre
 *  os demais — é o que impede uma loja nova de ser punida por ainda não ter
 *  termômetro, e o que impede o score de subir sozinho quando um dado some. */
function compor(pilares: Pilar[]): number | null {
  const medidos = pilares.filter((pilar) => pilar.nota !== null);
  if (medidos.length === 0) return null;
  const pesoTotal = medidos.reduce((soma, pilar) => soma + pilar.peso, 0);
  const soma = medidos.reduce((acumulado, pilar) => acumulado + (pilar.nota as number) * pilar.peso, 0);
  return Math.round(soma / pesoTotal);
}

/* ── Consulta ────────────────────────────────────────────────── */

export interface SaudeLojaFiltros {
  /** ISO yyyy-mm-dd. Ausentes, a janela vira os últimos 30 dias. */
  inicio?: string;
  fim?: string;
  brandIds?: string[];
}

function parseDataLocal(iso: string, fimDoDia: boolean): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return fimDoDia
    ? new Date(ano, mes - 1, dia, 23, 59, 59, 999)
    : new Date(ano, mes - 1, dia);
}

function resolverJanela(filtros?: SaudeLojaFiltros) {
  if (filtros?.inicio && filtros?.fim) {
    return { inicio: parseDataLocal(filtros.inicio, false), fim: parseDataLocal(filtros.fim, true) };
  }
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 29);
  inicio.setHours(0, 0, 0, 0);
  return { inicio, fim };
}

export async function obterSaudeLoja(
  ctx: CrudContext,
  filtros?: SaudeLojaFiltros,
): Promise<SaudeLojaResultado> {
  const { inicio, fim } = resolverJanela(filtros);
  const brandIds = (filtros?.brandIds ?? []).filter(Boolean);

  const condicaoMarca = brandIds.length > 0 ? [inArray(brand.id, brandIds)] : [];

  const marcas = await ctx.db
    .select({ id: brand.id, slug: brand.slug, nome: brand.name })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true), ...condicaoMarca))
    .orderBy(brand.name);

  if (marcas.length === 0) {
    return {
      marcas: [],
      scoreGeral: null,
      faixaGeralLabel: null,
      faixaGeralCor: null,
      periodoLabel: `${diaMes.format(inicio)} – ${diaMes.format(fim)}`,
      reputacaoIndisponivel: true,
      marcasComFalha: [],
      contasDesconectadas: [],
    };
  }

  const idsVisiveis = marcas.map((item) => item.id);

  // Tudo em paralelo: nenhuma dessas consultas depende do resultado da outra, e
  // as duas que saem para o Mercado Livre (reputação e reclamações) são as
  // lentas — esperá-las em série dobraria o tempo da página à toa.
  const [
    vendasPorMarca,
    avaliacoesPorMarca,
    catalogoPorMarca,
    reputacao,
    reclamacoes,
    atendimentoPorMarca,
    contasDesconectadas,
  ] = await Promise.all([
    ctx.db
      .select({
        brandId: pedido.brandId,
        receita: sum(pedido.total),
        pedidos: count(),
      })
      .from(pedido)
      .where(and(
        eq(pedido.orgId, ctx.orgId),
        inArray(pedido.brandId, idsVisiveis),
        gte(pedido.createdAt, inicio),
        lte(pedido.createdAt, fim),
        ne(pedido.status, "cancelado"),
        ne(pedido.status, "devolvido"),
      ))
      .groupBy(pedido.brandId),
    ctx.db
      .select({
        brandId: mlAvaliacaoAnuncio.brandId,
        // Média ponderada pelo número de opiniões, não média das médias: um
        // anúncio com 1 opinião nota 1,0 não pode pesar o mesmo que outro com
        // 500 opiniões nota 4,9. Anúncio sem opinião fica de fora da conta em
        // vez de entrar como zero.
        nota: sql<number | null>`
          case when sum(coalesce(${mlAvaliacaoAnuncio.reviewsTotal}, 0)) > 0
            then sum(${mlAvaliacaoAnuncio.ratingAverage} * ${mlAvaliacaoAnuncio.reviewsTotal})
                 / sum(${mlAvaliacaoAnuncio.reviewsTotal})
          end
        `,
        avaliacoes: sum(mlAvaliacaoAnuncio.reviewsTotal),
      })
      .from(mlAvaliacaoAnuncio)
      .where(and(
        eq(mlAvaliacaoAnuncio.orgId, ctx.orgId),
        inArray(mlAvaliacaoAnuncio.brandId, idsVisiveis),
        gt(mlAvaliacaoAnuncio.reviewsTotal, 0),
      ))
      .groupBy(mlAvaliacaoAnuncio.brandId),
    ctx.db
      .select({
        brandId: produto.brandId,
        ativos: count(),
        comSaldo: sql<number>`count(*) filter (where ${saldoDoProduto(ctx.orgId)} > 0)`,
        abaixoDoMinimo: sql<number>`count(*) filter (where ${produto.estoqueMinimo} > 0 and ${saldoDoProduto(ctx.orgId)} <= ${produto.estoqueMinimo})`,
      })
      .from(produto)
      .where(and(
        eq(produto.orgId, ctx.orgId),
        inArray(produto.brandId, idsVisiveis),
        eq(produto.ativo, true),
        isNull(produto.deletedAt),
      ))
      .groupBy(produto.brandId),
    obterReputacao(ctx).catch((): ReputacaoResultado => ({
      marcas: [],
      marcasComFalha: [],
      semContaConectada: true,
    })),
    obterReclamacoesAbertas(ctx).catch((): ReclamacoesResultado => ({
      itens: [],
      total: 0,
      marcasComFalha: [],
      semContaConectada: true,
    })),
    // incluirPorCanal: false — o pilar de score e a comparação lado a lado só
    // leem taxaResposta/medianaSegundos; a quebra por canal não é usada aqui
    // (ela existe para o card de Atendimento, que faz sua própria chamada
    // org-wide) e rodá-la por marca seria uma consulta extra jogada fora
    // a cada marca.
    Promise.all(marcas.map(async (item) => [
      item.id,
      await obterAtendimento(ctx, { inicio, fim, brandIds: [item.id], incluirPorCanal: false }),
    ] as const)),
    obterContasDesconectadas(ctx).catch((): ContaDesconectada[] => []),
  ]);

  const vendas = new Map(vendasPorMarca.map((linha) => [linha.brandId, linha]));
  const avaliacoes = new Map(avaliacoesPorMarca.map((linha) => [linha.brandId, linha]));
  const catalogo = new Map(catalogoPorMarca.map((linha) => [linha.brandId, linha]));
  const reputacaoPorMarca = new Map(reputacao.marcas.map((linha) => [linha.brandId, linha]));
  const atendimento = new Map(atendimentoPorMarca);

  // Depende do faturamento por marca (cobertura = receita com taxa conhecida
  // ÷ receita total), então só entra depois do Promise.all de cima resolver
  // — não dá pra rodar em paralelo com a query que produz esse número.
  const receitaTotalPorMarca = new Map(
    idsVisiveis.map((id) => [id, paraNumero(vendas.get(id)?.receita)]),
  );
  const [margemPorMarca, crescimentoPorMarca] = await Promise.all([
    obterMargemPorMarca(ctx, { inicio, fim, brandIds: idsVisiveis, receitaTotalPorMarca }),
    obterCrescimentoPorMarca(ctx, { inicio, fim, brandIds: idsVisiveis }),
  ]);

  const resultado: SaudeMarca[] = marcas.map((item) => {
    const venda = vendas.get(item.id);
    const faturamento = paraNumero(venda?.receita);
    const pedidos = paraNumero(venda?.pedidos);
    const ticketMedio = pedidos > 0 ? faturamento / pedidos : 0;

    const avaliacao = avaliacoes.get(item.id);
    const notaMedia = avaliacao?.nota === null || avaliacao?.nota === undefined
      ? null
      : Math.round(paraNumero(avaliacao.nota) * 10) / 10;
    const totalAvaliacoes = paraNumero(avaliacao?.avaliacoes);

    const catalogoMarca = catalogo.get(item.id);
    const ativos = paraNumero(catalogoMarca?.ativos);
    const comSaldo = paraNumero(catalogoMarca?.comSaldo);
    const abaixoDoMinimo = paraNumero(catalogoMarca?.abaixoDoMinimo);

    const reputacaoMarca = reputacaoPorMarca.get(item.id) ?? null;
    const atendimentoMarca = atendimento.get(item.id) ?? null;

    const reclamacoesDaMarca = reclamacoes.itens.filter((linha) => linha.marca === item.slug);
    const margemMarca = margemPorMarca.get(item.id) ?? null;
    const crescimentoMarca = crescimentoPorMarca.get(item.id) ?? null;

    const calculos: Record<ChavePilar, { nota: number | null; detalhe: string }> = {
      reputacao: pilarReputacao(reputacaoMarca),
      posVenda: pilarPosVenda(reputacaoMarca),
      satisfacao: pilarSatisfacao(notaMedia, totalAvaliacoes),
      atendimento: pilarAtendimento(atendimentoMarca),
      estoque: pilarEstoque(ativos, comSaldo, abaixoDoMinimo),
    };

    const pilares: Pilar[] = PILARES.map((config) => ({
      chave: config.chave,
      label: config.label,
      descricao: config.descricao,
      peso: config.peso,
      nota: calculos[config.chave].nota,
      detalhe: calculos[config.chave].detalhe,
    }));

    const score = compor(pilares);
    const faixa = score === null ? null : faixaDoScore(score);

    return {
      brandId: item.id,
      marca: item.slug,
      marcaLabel: getBrandConfig(item.slug)?.label ?? item.nome,
      score,
      faixaLabel: faixa?.label ?? null,
      faixaCor: faixa?.cor ?? null,
      pilares,
      pilaresMedidos: pilares.filter((pilar) => pilar.nota !== null).length,
      faturamento,
      faturamentoLabel: moeda.format(faturamento),
      pedidos,
      ticketMedio,
      ticketMedioLabel: moeda.format(ticketMedio),
      notaMedia,
      totalAvaliacoes,
      reclamacoesAbertas: reclamacoesDaMarca.length,
      emMediacao: reclamacoesDaMarca.filter((linha) => linha.emMediacao).length,
      reputacao: reputacaoMarca,
      atendimento: atendimentoMarca,
      margemPercentual: margemMarca?.margemPercentual ?? null,
      margemLiquidaLabel: margemMarca ? moeda.format(margemMarca.margemLiquida) : null,
      margemCoberturaPercentual: margemMarca?.coberturaPercentual ?? 0,
      taxaCancelamento: crescimentoMarca?.taxaCancelamento ?? null,
      concentracaoTop5: crescimentoMarca?.concentracaoTop5 ?? null,
      taxaRecorrencia: crescimentoMarca?.taxaRecorrencia ?? null,
    };
  });

  // Consolidado ponderado pelo faturamento: a marca que responde por 80% da
  // receita tem que pesar 80% no retrato da operação. Sem faturamento no
  // período (loja parada, recorte curto), cai para média simples — o contrário
  // seria dividir por zero e devolver "sem score" para quem tem score.
  const medidas = resultado.filter((item) => item.score !== null);
  const pesoTotal = medidas.reduce((soma, item) => soma + item.faturamento, 0);
  const scoreGeral = medidas.length === 0
    ? null
    : pesoTotal > 0
      ? Math.round(medidas.reduce((soma, item) => soma + (item.score as number) * item.faturamento, 0) / pesoTotal)
      : Math.round(medidas.reduce((soma, item) => soma + (item.score as number), 0) / medidas.length);
  const faixaGeral = scoreGeral === null ? null : faixaDoScore(scoreGeral);

  return {
    // Melhor primeiro: a comparação lado a lado deve abrir mostrando quem lidera.
    marcas: resultado.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    scoreGeral,
    faixaGeralLabel: faixaGeral?.label ?? null,
    faixaGeralCor: faixaGeral?.cor ?? null,
    periodoLabel: `${diaMes.format(inicio)} – ${diaMes.format(fim)}`,
    reputacaoIndisponivel: reputacao.semContaConectada,
    marcasComFalha: [...new Set([...reputacao.marcasComFalha, ...reclamacoes.marcasComFalha])],
    contasDesconectadas,
  };
}

/** Mesmo saldo que o Estoque e o Painel usam: o MAIOR entre os canais, nunca a
 *  soma — o mesmo item anunciado em dois canais não vira estoque em dobro. */
function saldoDoProduto(orgId: string) {
  return sql`coalesce((
    select max(${estoqueCanalSaldo.saldo}) from ${estoqueCanalSaldo}
    where ${estoqueCanalSaldo.produtoId} = ${produto.id}
      and ${estoqueCanalSaldo.orgId} = ${orgId}
  ), 0)`;
}
