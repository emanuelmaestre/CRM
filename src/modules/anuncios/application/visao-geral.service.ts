import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsCampanhaSnapshot, brand } from "@/shared/lib/db/schema";
import {
  DIAS_ATRIBUICAO, diasJanelaPadrao, EXPOE_VENDA_ORGANICA, inicioDaJanelaPadrao,
  PLATAFORMA_ANUNCIOS_PADRAO, type PlataformaAnuncios,
} from "../domain/plataformas";
import { getBrandConfig, compararPorOrdemDeMarca } from "@/shared/config/brands";
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
  /** Dias que os números desta marca somam. Sem período escolhido é a janela
   *  padrão do canal (ver `DIAS_JANELA_PADRAO`) terminando no dia mais
   *  recente que ESTA marca tem — duas marcas podem ter sincronizado em dias
   *  diferentes, e nenhuma herda a janela da outra. */
  janela: { inicio: string; fim: string };
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

/** Marca que existe e está ativa, mas não tem nenhum anúncio na plataforma
 *  escolhida — a KARZI não opera Shopee, por exemplo.
 *
 *  Vem separada de `marcas` de propósito: some do consolidado e dos cards
 *  (não há o que somar), mas continua aparecendo no seletor, apagada e
 *  travada. Antes ela simplesmente desaparecia da fileira, e não havia como
 *  distinguir "não anuncia aqui" de "quebrou e sumiu". */
export interface MarcaIndisponivel {
  brandId: string;
  brandSlug: string;
  brandLabel: string;
}

/** O recorte que produziu estes números, para a tela poder dizê-lo em voz
 *  alta. Sem isso, "últimos 7 dias" e "hoje" chegam com a mesma cara e o
 *  operador lê o total da semana como se fosse o do dia. */
export interface JanelaVisaoGeral {
  plataforma: PlataformaAnuncios;
  /** Quantos dias a janela cobre. 1 = só o dia mais recente. */
  dias: number;
  /** Falso quando a janela é a padrão do canal; verdadeiro quando quem
   *  chamou escolheu início e fim no calendário. */
  periodoDefinido: boolean;
  /** Dias que o canal ainda pode creditar depois do clique (7 na Shopee, 0
   *  no Mercado Livre) — o que sustenta o aviso de "ainda subindo". */
  diasAtribuicao: number;
}

export interface VisaoGeralResultado {
  marcas: VisaoGeralMarca[];
  janela: JanelaVisaoGeral;
  /** Ativas, mas sem anúncio nenhum na plataforma escolhida. */
  marcasIndisponiveis: MarcaIndisponivel[];
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
function agregarResumo(campanhas: CampanhaVisaoGeral[], plataforma: PlataformaAnuncios): VisaoGeralResumo {
  if (campanhas.length === 0) return resumoVazio();

  /* Canal que não informa venda orgânica não tem TACOS nem dependência de
     mídia — falta metade das duas contas.

     Isso precisa ser dito aqui, e não deduzido do número: `receitaOrganica`
     chega null do banco (a Shopee não devolve o dado; ver
     sincronizacao-shopee.service.ts, que grava null de propósito justamente
     para "manter a TACOS honestamente vazia"), mas `paraNumero(null)` é 0, e
     zero é um valor legítimo. Com zero no denominador extra, TACOS virava
     `investimento / receita` — exatamente o ACOS, mostrado ao lado dele com
     outro nome — e a dependência de mídia virava "crítica, 100%", lida como
     "esta marca depende inteiramente de anúncio" quando o certo é "este canal
     não conta essa parte". Os dois números eram falsos, não vazios. */
  const canalInformaOrganico = EXPOE_VENDA_ORGANICA[plataforma] ?? true;

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
    tacos: canalInformaOrganico && (receitaTotal + receitaOrganica) > 0
      ? Math.round((investimentoTotal / (receitaTotal + receitaOrganica)) * 1000) / 10
      : null,
    vendasPublicitarias,
    vendasOrganicas,
    receitaOrganica,
    cliques: cliquesTotal,
    impressoes: impressoesTotal,
    vendas: vendasTotal,
    dependenciaMidia: canalInformaOrganico
      ? calcularDependenciaMidia(vendasPublicitarias, vendasPublicitarias + vendasOrganicas)
      : { percentual: null, classificacao: null },
    cvrMedio: cliquesTotal > 0 ? Math.round((vendasTotal / cliquesTotal) * 1000) / 10 : null,
    ctrMedio: impressoesTotal > 0 ? Math.round((cliquesTotal / impressoesTotal) * 1000) / 10 : null,
    cpcMedio: cliquesTotal > 0 ? Math.round((investimentoTotal / cliquesTotal) * 100) / 100 : null,
  };
}

export async function obterVisaoGeral(
  ctx: CrudContext,
  opcoes: { brandIds?: string[]; inicio?: string; fim?: string; plataforma?: PlataformaAnuncios } = {},
): Promise<VisaoGeralResultado> {
  const plataforma = opcoes.plataforma ?? PLATAFORMA_ANUNCIOS_PADRAO;
  const condicaoMarca = opcoes.brandIds && opcoes.brandIds.length > 0 ? [inArray(brand.id, opcoes.brandIds)] : [];

  const marcas = (await ctx.db
    .select({ id: brand.id, slug: brand.slug, nome: brand.name })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true), ...condicaoMarca)))
    .sort(compararPorOrdemDeMarca);

  const resultado: VisaoGeralMarca[] = [];
  const indisponiveis: MarcaIndisponivel[] = [];
  const idsDasMarcas = marcas.map((marca) => marca.id);

  /* Antes este trecho vivia dentro do laço abaixo: para cada marca saíam duas
     consultas, e como o pool do projeto é de uma conexão só (ver db/index.ts),
     elas não corriam em paralelo — oito marcas viravam dezesseis idas ao banco
     em fila. Agora são duas idas no total, e o laço só distribui em memória o
     que já veio. */

  // Snapshot mais recente por marca — não necessariamente "hoje": se a
  // sincronização de hoje ainda não rodou, mostra o último dado que existe em
  // vez de aparentar que não há dado nenhum. `criadoEm` junto pra saber a que
  // horas essa sincronização rodou — `data` sozinha só diz o dia, não a hora.
  const ultimosSnapshots = idsDasMarcas.length === 0 ? [] : await ctx.db
    .select({
      brandId: adsCampanhaSnapshot.brandId,
      data: adsCampanhaSnapshot.data,
      criadoEm: adsCampanhaSnapshot.criadoEm,
    })
    .from(adsCampanhaSnapshot)
    .where(and(
      eq(adsCampanhaSnapshot.orgId, ctx.orgId),
      inArray(adsCampanhaSnapshot.brandId, idsDasMarcas),
      eq(adsCampanhaSnapshot.plataforma, plataforma),
    ))
    .orderBy(desc(adsCampanhaSnapshot.data), desc(adsCampanhaSnapshot.criadoEm));

  // A ordenação acima garante que a primeira linha vista de cada marca é a mais
  // recente — é o mesmo que o `limit(1)` por marca fazia, agora sem repetir a
  // consulta.
  const ultimoPorMarca = new Map<string, { data: string; criadoEm: Date }>();
  for (const linha of ultimosSnapshots) {
    if (!ultimoPorMarca.has(linha.brandId)) {
      ultimoPorMarca.set(linha.brandId, { data: linha.data, criadoEm: linha.criadoEm });
    }
  }

  const periodoDefinido = Boolean(opcoes.inicio && opcoes.fim);

  // Sem período escolhido, cada marca olha a janela padrão DO CANAL terminando
  // no próprio dia mais recente — que pode ser diferente entre marcas. No
  // Mercado Livre a janela é de um dia, exatamente o recorte que esta tela
  // sempre teve; na Shopee são 7, porque o dia de hoje ainda não recebeu as
  // vendas que ela credita depois do clique (ver domain/plataformas.ts).
  const janelaPorMarca = new Map<string, { inicio: string; fim: string }>();
  for (const [brandId, ultimo] of ultimoPorMarca) {
    janelaPorMarca.set(brandId, { inicio: inicioDaJanelaPadrao(ultimo.data, plataforma), fim: ultimo.data });
  }

  // A consulta é uma só, cobrindo da menor abertura à maior data entre as
  // marcas; o recorte exato de cada uma é reaplicado em memória logo abaixo.
  // Continuam sendo duas idas ao banco no total, como antes.
  const janelas = [...janelaPorMarca.values()];
  const aberturaGlobal = janelas.length > 0 ? janelas.reduce((menor, j) => (j.inicio < menor ? j.inicio : menor), janelas[0].inicio) : null;
  const fechamentoGlobal = janelas.length > 0 ? janelas.reduce((maior, j) => (j.fim > maior ? j.fim : maior), janelas[0].fim) : null;

  const todasAsLinhas = idsDasMarcas.length === 0 || (!periodoDefinido && aberturaGlobal === null) ? [] : await ctx.db
    .select()
    .from(adsCampanhaSnapshot)
    .where(and(
      eq(adsCampanhaSnapshot.orgId, ctx.orgId),
      inArray(adsCampanhaSnapshot.brandId, idsDasMarcas),
      eq(adsCampanhaSnapshot.plataforma, plataforma),
      ...(periodoDefinido
        ? [gte(adsCampanhaSnapshot.data, opcoes.inicio!), lte(adsCampanhaSnapshot.data, opcoes.fim!)]
        : [gte(adsCampanhaSnapshot.data, aberturaGlobal!), lte(adsCampanhaSnapshot.data, fechamentoGlobal!)]),
    ))
    .orderBy(asc(adsCampanhaSnapshot.data));

  const linhasPorMarca = new Map<string, typeof todasAsLinhas>();
  for (const linha of todasAsLinhas) {
    const grupo = linhasPorMarca.get(linha.brandId) ?? [];
    grupo.push(linha);
    linhasPorMarca.set(linha.brandId, grupo);
  }

  for (const marca of marcas) {
    const ultimoSnapshot = ultimoPorMarca.get(marca.id) ?? null;
    const ultimaData = ultimoSnapshot?.data ?? null;

    // Sem nenhum snapshot nesta plataforma a marca sai dos números, mas não
    // some da tela: vai para `marcasIndisponiveis` e o seletor a mostra
    // apagada e travada, como já faz com canal ainda não integrado.
    if (!ultimaData) {
      indisponiveis.push({
        brandId: marca.id,
        brandSlug: marca.slug,
        brandLabel: getBrandConfig(marca.slug)?.label ?? marca.nome,
      });
      continue;
    }

    // Sem período, cada marca fica só com as linhas da própria janela: a
    // consulta trouxe a união das janelas de todas as marcas, e uma marca não
    // pode herdar os dias da outra.
    const janelaDaMarca = janelaPorMarca.get(marca.id) ?? { inicio: ultimaData, fim: ultimaData };
    const linhasCampanhaBrutas = (linhasPorMarca.get(marca.id) ?? [])
      .filter((linha) => periodoDefinido || (linha.data >= janelaDaMarca.inicio && linha.data <= janelaDaMarca.fim));

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
        estoqueDiasCobertura: null,
      });

      const oportunidades = identificarOportunidades({
        campanhaId: String(linha.campaignId),
        campanhaNome: linha.nome,
        roasAtual: roas, roasAnterior: null,
        cvr, gastoAtual: investimento,
        estoqueDiasCobertura: null,
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
      janela: periodoDefinido ? { inicio: opcoes.inicio!, fim: opcoes.fim! } : janelaDaMarca,
      dataSnapshot: ultimaData,
      sincronizadoEm: ultimoSnapshot?.criadoEm?.toISOString() ?? null,
      resumo: agregarResumo(campanhas, plataforma),
      campanhas: campanhas.sort((a, b) => b.investimento - a.investimento),
      alertasIndividuais,
      alertasAgrupados,
      oportunidades: campanhas.flatMap((c) => c.oportunidades).sort((a, b) => b.scoreImpacto - a.scoreImpacto),
    });
  }

  const todasCampanhas = resultado.flatMap((m) => m.campanhas);

  // Dias que a janela cobre: o período escolhido quando há um, senão a janela
  // padrão do canal (que é igual para todas as marcas — só o dia final muda).
  const diasDaJanela = periodoDefinido
    ? Math.max(1, Math.round(
        (new Date(`${opcoes.fim!}T00:00:00Z`).getTime() - new Date(`${opcoes.inicio!}T00:00:00Z`).getTime()) / 86_400_000,
      ) + 1)
    : diasJanelaPadrao(plataforma);

  return {
    marcas: resultado,
    janela: {
      plataforma,
      dias: diasDaJanela,
      periodoDefinido,
      diasAtribuicao: DIAS_ATRIBUICAO[plataforma] ?? 0,
    },
    marcasIndisponiveis: indisponiveis,
    resumoConsolidado: agregarResumo(todasCampanhas, plataforma),
    // Continua olhando só `resultado`: uma marca indisponível não é dado, é a
    // ausência dele — contá-la aqui esconderia o estado de "nada sincronizado".
    semDados: resultado.length === 0,
  };
}
