import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, adsCampanhaSnapshot, brand } from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";
import { calcularDependenciaMidia } from "./metricas-calculadas";
import { diagnosticarCampanha, type Diagnostico } from "./motor-diagnostico";
import { identificarOportunidades, type Oportunidade } from "./oportunidades";
import { alertasDeDiagnosticos, alertasDeOportunidades, processarAlertas, type GrupoAlertas, type Alerta } from "./alertas";

/* ── Visão Geral (Fase 4 — Apresentação) ──────────────────────────
   Junta tudo: lê o snapshot mais recente por campanha (Fase 1), cruza com
   o motor de cálculo (Fase 2) e o motor de diagnóstico (Fase 3), devolve
   uma estrutura pronta pra tela renderizar sem fazer conta nenhuma.

   Não há lucro nem break-even aqui: os dois dependiam do custo do produto,
   que nunca existiu no schema e não será preenchido. O que sobra é o que o
   Mercado Livre entrega medido — investimento, receita, ROAS, ACOS, TACOS,
   funil — e nenhum desses precisa de custo para ser verdadeiro. */

export interface CampanhaVisaoGeral {
  campanhaId: string;
  nome: string;
  status: string;
  /** Data original de criação da campanha no Mercado Livre. */
  criadaEm: string | null;
  estrategia: string;
  orcamento: number | null;
  roasObjetivo: number | null;
  investimento: number;
  receita: number;
  cliques: number;
  impressoes: number;
  vendas: number;
  roas: number | null;
  acos: number | null;
  cvr: number | null;
  ctr: number | null;
  vendasDiretas: number;
  vendasIndiretas: number;
  vendasOrganicas: number;
  receitaOrganica: number;
  sov: number | null;
  impressionShare: number | null;
  topImpressionShare: number | null;
  lostImpressionShareByBudget: number | null;
  lostImpressionShareByAdRank: number | null;
  acosBenchmark: number | null;
  diagnosticos: Diagnostico[];
  oportunidades: Oportunidade[];
}

export interface VisaoGeralResumo {
  investimentoTotal: number;
  receitaTotal: number;
  /** Null quando não há investimento no período — ROAS não existe sem gasto. */
  roasMedio: number | null;
  acosMedio: number | null;
  tacos: number | null;
  vendasPublicitarias: number;
  vendasOrganicas: number;
  receitaOrganica: number;
  cliques: number;
  impressoes: number;
  vendas: number;
  dependenciaMidia: ReturnType<typeof calcularDependenciaMidia>;
  cvrMedio: number | null;
  ctrMedio: number | null;
  cpcMedio: number | null;
}

export interface VisaoGeralMarca {
  brandId: string;
  brandSlug: string;
  brandLabel: string;
  dataSnapshot: string | null;
  /** Quando a sincronização de fato rodou (ISO, com hora) — diferente de
   *  `dataSnapshot`, que é só o dia do calendário a que as métricas se
   *  referem. `data` na tabela é uma coluna `date`, sem hora nenhuma; quem
   *  carrega hora é `criadoEm`, o timestamp real da linha. */
  sincronizadoEm: string | null;
  resumo: VisaoGeralResumo;
  campanhas: CampanhaVisaoGeral[];
  alertasIndividuais: Alerta[];
  alertasAgrupados: GrupoAlertas[];
  oportunidades: Oportunidade[];
}

export interface VisaoGeralResultado {
  marcas: VisaoGeralMarca[];
  /** Consolidado das marcas visíveis — soma simples, não ponderada (ao
   *  contrário do Score de Saúde em Métricas): aqui o que importa é o
   *  investimento e retorno agregados, não uma nota composta. */
  resumoConsolidado: VisaoGeralResumo;
  /** Nenhuma marca tem snapshot ainda — primeira sincronização não rodou,
   *  ou rodou e a conta não tinha Publicidade habilitada. */
  semDados: boolean;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function paraNumeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const parsed = Number(valor);
  return Number.isFinite(parsed) ? parsed : null;
}

function resumoVazio(): VisaoGeralResumo {
  return {
    investimentoTotal: 0, receitaTotal: 0, roasMedio: null,
    acosMedio: null, tacos: null,
    vendasPublicitarias: 0, vendasOrganicas: 0,
    receitaOrganica: 0,
    cliques: 0, impressoes: 0, vendas: 0,
    dependenciaMidia: { percentual: null, classificacao: null },
    cvrMedio: null, ctrMedio: null, cpcMedio: null,
  };
}

/** Agrega o resumo de uma marca a partir das campanhas já calculadas —
 *  soma o que é somável, recalcula proporção (ROAS/ACOS/CVR/CTR) sobre os
 *  totais em vez de fazer média das médias, que distorceria campanhas
 *  pequenas para o mesmo peso de campanhas grandes. */
function agregarResumo(campanhas: CampanhaVisaoGeral[]): VisaoGeralResumo {
  if (campanhas.length === 0) return resumoVazio();

  const investimentoTotal = Math.round(campanhas.reduce((s, c) => s + c.investimento, 0) * 100) / 100;
  const receitaTotal = Math.round(campanhas.reduce((s, c) => s + c.receita, 0) * 100) / 100;
  const cliquesTotal = campanhas.reduce((s, c) => s + c.cliques, 0);
  const impressoesTotal = campanhas.reduce((s, c) => s + c.impressoes, 0);
  const vendasTotal = campanhas.reduce((s, c) => s + c.vendas, 0);
  const vendasOrganicas = campanhas.reduce((s, c) => s + c.vendasOrganicas, 0);
  const receitaOrganica = Math.round(campanhas.reduce((s, c) => s + c.receitaOrganica, 0) * 100) / 100;
  const vendasPublicitarias = campanhas.reduce((s, c) => s + c.vendasDiretas + c.vendasIndiretas, 0);

  return {
    investimentoTotal,
    receitaTotal,
    roasMedio: investimentoTotal > 0 ? Math.round((receitaTotal / investimentoTotal) * 100) / 100 : null,
    acosMedio: receitaTotal > 0 ? Math.round((investimentoTotal / receitaTotal) * 1000) / 10 : null,
    // TACOS: investimento sobre a receita TOTAL (paga + orgânica) — é o que
    // distingue de ACOS, que só olha a receita atribuída à publicidade.
    tacos: (receitaTotal + receitaOrganica) > 0
      ? Math.round((investimentoTotal / (receitaTotal + receitaOrganica)) * 1000) / 10
      : null,
    vendasPublicitarias,
    vendasOrganicas,
    receitaOrganica,
    cliques: cliquesTotal,
    impressoes: impressoesTotal,
    vendas: vendasTotal,
    dependenciaMidia: calcularDependenciaMidia(vendasPublicitarias, vendasPublicitarias + vendasOrganicas),
    cvrMedio: cliquesTotal > 0 ? Math.round((vendasTotal / cliquesTotal) * 1000) / 10 : null,
    ctrMedio: impressoesTotal > 0 ? Math.round((cliquesTotal / impressoesTotal) * 1000) / 10 : null,
    cpcMedio: cliquesTotal > 0 ? Math.round((investimentoTotal / cliquesTotal) * 100) / 100 : null,
  };
}

export async function obterVisaoGeral(
  ctx: CrudContext,
  opcoes: { brandIds?: string[]; inicio?: string; fim?: string } = {},
): Promise<VisaoGeralResultado> {
  const condicaoMarca = opcoes.brandIds && opcoes.brandIds.length > 0 ? [inArray(brand.id, opcoes.brandIds)] : [];

  const marcas = await ctx.db
    .select({ id: brand.id, slug: brand.slug, nome: brand.name })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true), ...condicaoMarca))
    .orderBy(brand.name);

  const resultado: VisaoGeralMarca[] = [];

  for (const marca of marcas) {
    // Snapshot mais recente disponível por campanha — não necessariamente
    // "hoje": se a sincronização de hoje ainda não rodou, mostra o último
    // dado que existe em vez de aparentar que não há dado nenhum.
    // `criadoEm` junto pra saber a que horas essa sincronização rodou —
    // `data` sozinha só diz o dia, não a hora.
    const ultimoSnapshot = await ctx.db
      .select({ data: adsCampanhaSnapshot.data, criadoEm: adsCampanhaSnapshot.criadoEm })
      .from(adsCampanhaSnapshot)
      .where(and(eq(adsCampanhaSnapshot.orgId, ctx.orgId), eq(adsCampanhaSnapshot.brandId, marca.id)))
      .orderBy(desc(adsCampanhaSnapshot.data), desc(adsCampanhaSnapshot.criadoEm))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    const ultimaData = ultimoSnapshot?.data ?? null;

    if (!ultimaData) continue; // marca sem nenhum snapshot ainda — nem aparece na lista

    const periodoDefinido = Boolean(opcoes.inicio && opcoes.fim);
    const linhasCampanhaBrutas = await ctx.db
      .select()
      .from(adsCampanhaSnapshot)
      .where(and(
        eq(adsCampanhaSnapshot.orgId, ctx.orgId),
        eq(adsCampanhaSnapshot.brandId, marca.id),
        ...(periodoDefinido
          ? [gte(adsCampanhaSnapshot.data, opcoes.inicio!), lte(adsCampanhaSnapshot.data, opcoes.fim!)]
          : [eq(adsCampanhaSnapshot.data, ultimaData)]),
      ))
      .orderBy(asc(adsCampanhaSnapshot.data));

    const porCampanha = new Map<string, typeof linhasCampanhaBrutas>();
    for (const linha of linhasCampanhaBrutas) {
      const grupo = porCampanha.get(linha.campaignId) ?? [];
      grupo.push(linha);
      porCampanha.set(linha.campaignId, grupo);
    }
    const linhasCampanha = [...porCampanha.values()].map((linhas) => {
      const base = linhas[linhas.length - 1];
      const somar = (campo: keyof typeof base) => linhas.reduce((total, linha) => total + paraNumero(linha[campo]), 0);
      const clicks = somar("clicks");
      const prints = somar("prints");
      const cost = somar("cost");
      const totalAmount = somar("totalAmount");
      const unitsQuantity = somar("unitsQuantity");
      return {
        ...base,
        clicks, prints,
        cost: String(cost), totalAmount: String(totalAmount), unitsQuantity,
        organicUnitsQuantity: somar("organicUnitsQuantity"),
        organicUnitsAmount: String(somar("organicUnitsAmount")),
        directUnitsQuantity: somar("directUnitsQuantity"),
        indirectUnitsQuantity: somar("indirectUnitsQuantity"),
        directAmount: String(somar("directAmount")), indirectAmount: String(somar("indirectAmount")),
        ctr: prints > 0 ? String((clicks / prints) * 100) : null,
        cpc: clicks > 0 ? String(cost / clicks) : null,
        acos: totalAmount > 0 ? String((cost / totalAmount) * 100) : null,
        roas: cost > 0 ? String(totalAmount / cost) : null,
        cvr: clicks > 0 ? String((unitsQuantity / clicks) * 100) : null,
      };
    });

    const linhasAnuncio = await ctx.db
      .select({
        campaignId: adsAnuncioSnapshot.campaignId,
        cliques: adsAnuncioSnapshot.clicks,
        estoqueProdutoId: adsAnuncioSnapshot.produtoId,
      })
      .from(adsAnuncioSnapshot)
      .where(and(
        eq(adsAnuncioSnapshot.orgId, ctx.orgId),
        eq(adsAnuncioSnapshot.brandId, marca.id),
        eq(adsAnuncioSnapshot.data, ultimaData),
      ));
    void linhasAnuncio; // reservado para o cruzamento de estoque por campanha (próximo incremento)

    const campanhas: CampanhaVisaoGeral[] = linhasCampanha.map((linha) => {
      const investimento = paraNumero(linha.cost);
      const receita = paraNumero(linha.totalAmount);
      const vendas = paraNumero(linha.unitsQuantity);
      const cliques = paraNumero(linha.clicks);
      const impressoes = paraNumero(linha.prints);

      // O Mercado Livre manda "0.0000" literal para ROAS/ACOS/CVR/CTR
      // quando o denominador (custo, cliques, impressões) é zero — divisão
      // por zero, matematicamente indefinida, não "resultado zero". Sem
      // este ajuste, uma campanha que não gastou nada apareceria com
      // "ROAS 0" (parece prejuízo) em vez de "sem dado" (não rodou ainda).
      const roas = investimento > 0 ? paraNumeroOuNull(linha.roas) : null;
      const acos = investimento > 0 ? paraNumeroOuNull(linha.acos) : null;

      const cvrFracao = cliques > 0 ? paraNumeroOuNull(linha.cvr) : null;
      const cvr = cvrFracao !== null ? cvrFracao / 100 : null; // API devolve CVR em % (ex.: 5.26), motor espera fração
      const ctrFracao = impressoes > 0 ? paraNumeroOuNull(linha.ctr) : null;

      const diagnosticos = diagnosticarCampanha({
        impressoes, cliques, vendas,
        ctr: ctrFracao !== null ? ctrFracao / 100 : null,
        cvr,
        cpcAtual: paraNumeroOuNull(linha.cpc), cpcAnterior: null, cvrAnterior: null,
        roasAtual: roas,
        lostImpressionShareByBudget: null, lostImpressionShareByAdRank: null,
        estoqueDiasCobertura: null,
      });

      const oportunidades = identificarOportunidades({
        campanhaId: String(linha.campaignId),
        campanhaNome: linha.nome,
        roasAtual: roas, roasAnterior: null,
        cvr, gastoAtual: investimento,
        estoqueDiasCobertura: null,
        lostImpressionShareByBudget: null, lostImpressionShareByAdRank: null,
        cliques,
      });

      return {
        campanhaId: String(linha.campaignId),
        nome: linha.nome,
        status: linha.status,
        criadaEm: linha.campanhaCriadaEm?.toISOString() ?? null,
        estrategia: linha.estrategia,
        orcamento: paraNumeroOuNull(linha.orcamento),
        roasObjetivo: paraNumeroOuNull(linha.roasObjetivo),
        investimento, receita, cliques, impressoes, vendas,
        roas, acos, cvr, ctr: ctrFracao !== null ? ctrFracao / 100 : null,
        vendasDiretas: paraNumero(linha.directUnitsQuantity),
        vendasIndiretas: paraNumero(linha.indirectUnitsQuantity),
        vendasOrganicas: paraNumero(linha.organicUnitsQuantity),
        receitaOrganica: paraNumero(linha.organicUnitsAmount),
        sov: paraNumeroOuNull(linha.sov),
        impressionShare: paraNumeroOuNull(linha.impressionShare),
        topImpressionShare: paraNumeroOuNull(linha.topImpressionShare),
        lostImpressionShareByBudget: paraNumeroOuNull(linha.lostImpressionShareByBudget),
        lostImpressionShareByAdRank: paraNumeroOuNull(linha.lostImpressionShareByAdRank),
        acosBenchmark: paraNumeroOuNull(linha.acosBenchmark),
        diagnosticos, oportunidades,
      };
    });

    const alertasBrutos = campanhas.flatMap((c) => [
      ...alertasDeDiagnosticos(c.campanhaId, c.nome, c.diagnosticos),
      ...alertasDeOportunidades(c.oportunidades),
    ]);
    // Sem persistência de "última ocorrência" ainda (isso pede uma tabela
    // própria, natural extensão da Fase 1) — cooldown roda com histórico
    // vazio por enquanto, então nada é suprimido ainda.
    const { individuais: alertasIndividuais, grupos: alertasAgrupados } = processarAlertas(alertasBrutos, new Map(), 24);

    resultado.push({
      brandId: marca.id,
      brandSlug: marca.slug,
      brandLabel: getBrandConfig(marca.slug)?.label ?? marca.nome,
      dataSnapshot: ultimaData,
      sincronizadoEm: ultimoSnapshot?.criadoEm?.toISOString() ?? null,
      resumo: agregarResumo(campanhas),
      campanhas: campanhas.sort((a, b) => b.investimento - a.investimento),
      alertasIndividuais,
      alertasAgrupados,
      oportunidades: campanhas.flatMap((c) => c.oportunidades).sort((a, b) => b.scoreImpacto - a.scoreImpacto),
    });
  }

  const todasCampanhas = resultado.flatMap((m) => m.campanhas);

  return {
    marcas: resultado,
    resumoConsolidado: agregarResumo(todasCampanhas),
    semDados: resultado.length === 0,
  };
}
