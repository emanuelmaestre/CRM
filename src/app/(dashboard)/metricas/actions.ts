"use server";

import { unstable_cache } from "next/cache";
import { medirTempo } from "@/shared/lib/observability/medir-tempo";
import { z } from "zod";
import {
  contarPublicacoesPorMarca,
  enriquecerDesempenhoPublicacoes,
  obterDesempenhoPublicacoesBase,
  PUBLICACOES_CACHE_TAG,
  type DesempenhoPublicacoesResultado,
} from "@/modules/metricas/application/publicacoes.service";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { obterSaudeLoja, type SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import { obterPosVenda, type PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";
import { obterSnapshotAnterior, type SnapshotMetricas } from "@/modules/metricas/application/snapshot-metricas.service";
import {
  aprovarSugestao,
  listarInsights,
  listarSugestoes,
  rejeitarSugestao,
} from "@/modules/ai/application/ai.service";

/** Mesma régua da rota (/metricas é admin+gestor): a checagem no layout
 *  protege a navegação, esta protege a chamada direta da server action. */
const PERFIS = ["admin", "gestor"] as const;

const FiltrosSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  brandIds: z.array(z.string().uuid()).max(20).optional(),
  // Tipos de canal ("mercadolivre", "shopee", …) — os mesmos valores de
  // `pedido.canal` e `channel_account.tipo`, e a tela só oferece o que veio do
  // banco (ver actionObterFiltrosPedidos). Fica `string` em vez de enum de
  // propósito: canal novo entra sem precisar de deploy deste arquivo, e um
  // valor desconhecido simplesmente não casa nenhuma linha em vez de derrubar
  // a página inteira com erro de validação. Lista vazia = todos os canais.
  canais: z.array(z.string().min(1).max(40)).max(5).optional(),
  leve: z.boolean().optional(),
});

export type MetricasFiltros = z.infer<typeof FiltrosSchema>;

const PublicacoesSchema = z.object({
  brandId: z.string().uuid(),
  inicio: z.string().date(),
  fim: z.string().date(),
  detalhes: z.boolean().optional(),
});

type ConsultaPublicacoes = Omit<z.infer<typeof PublicacoesSchema>, "detalhes">;

const obterDesempenhoPublicacoesBaseComCache = unstable_cache(
  async (orgId: string, filtros: ConsultaPublicacoes) =>
    obterDesempenhoPublicacoesBase({ db, orgId, perfil: "gestor" }, filtros),
  ["metricas-publicacoes-base"],
  { revalidate: 120, tags: [PUBLICACOES_CACHE_TAG] },
);

/* Publicações pagina as métricas patrocinadas do período e consulta a
   qualidade de no máximo 20 anúncios exibidos. Os argumentos entram na chave do cache,
   então organizações, marcas e períodos nunca compartilham resultado. A
   autorização continua fora do cache e roda em toda chamada. */
const obterDesempenhoPublicacoesComCache = unstable_cache(
  async (orgId: string, filtros: ConsultaPublicacoes) => {
    const base = await obterDesempenhoPublicacoesBaseComCache(orgId, filtros);
    return enriquecerDesempenhoPublicacoes({ db, orgId, perfil: "gestor" }, filtros, base);
  },
  ["metricas-publicacoes"],
  { revalidate: 120, tags: [PUBLICACOES_CACHE_TAG] },
);

export async function actionObterDesempenhoPublicacoes(
  filtros: z.infer<typeof PublicacoesSchema>,
): Promise<DesempenhoPublicacoesResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  const filtrosValidos = PublicacoesSchema.parse(filtros);
  const { detalhes, ...consulta } = filtrosValidos;
  return medirTempo(
    "metricas/publicacoes",
    () => detalhes === false
      ? obterDesempenhoPublicacoesBaseComCache(ctx.orgId, consulta)
      : obterDesempenhoPublicacoesComCache(ctx.orgId, consulta),
  );
}

const ContarPublicacoesSchema = z.object({
  brandIds: z.array(z.string().uuid()).max(20),
  inicio: z.string().date(),
  fim: z.string().date(),
});

const contarPublicacoesPorMarcaComCache = unstable_cache(
  async (orgId: string, filtros: z.infer<typeof ContarPublicacoesSchema>) =>
    contarPublicacoesPorMarca({ db, orgId, perfil: "gestor" }, filtros),
  ["metricas-publicacoes-contagem"],
  { revalidate: 120, tags: [PUBLICACOES_CACHE_TAG] },
);

/** Alimenta o número ao lado de cada pílula de marca em Publicações — mesmo
 *  espírito de `contarPedidosPorMarca`/`contarProdutosPorMarca`, só que
 *  aqui a contagem não vem do banco: chama a API de Product Ads do
 *  Mercado Livre por marca (ver `contarPublicacoesPorMarca`). */
export async function actionContarPublicacoesPorMarca(
  filtros: z.infer<typeof ContarPublicacoesSchema>,
): Promise<Array<{ brandId: string; total: number }>> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  const filtrosValidos = ContarPublicacoesSchema.parse(filtros);
  return medirTempo(
    "metricas/publicacoes-contagem",
    () => contarPublicacoesPorMarcaComCache(ctx.orgId, filtrosValidos),
  );
}

export async function actionObterSaudeLoja(filtros: MetricasFiltros = {}): Promise<SaudeLojaResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const filtrosValidos = FiltrosSchema.parse(filtros);
  return medirTempo("metricas/saude-loja", () => obterSaudeLoja(ctx, filtrosValidos));
}

export async function actionObterPosVenda(filtros: MetricasFiltros = {}): Promise<PosVendaResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const { inicio, fim, brandIds, canais } = FiltrosSchema.parse(filtros);
  return obterPosVenda(ctx, { ...resolverJanela(inicio, fim), brandIds, canais });
}

/** Foto de N dias atrás gravada pelo job A30 — a base de comparação que
 *  Giro baixo, Parados, Repor em breve e Pontuação da loja não tinham
 *  antes (saldo de estoque e score da loja não guardavam histórico). Null
 *  até a tabela acumular pelo menos uma foto no passado. */
export async function actionObterSnapshotAnterior(diasAtras = 1): Promise<SnapshotMetricas | null> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return obterSnapshotAnterior(ctx, diasAtras);
}

/* ── Recomendações ───────────────────────────────────────────────
   Insights de funil e sugestões de campanha vieram da antiga página de
   Relatórios e continuam aqui — uma métrica sem "e daí?" é um número
   bonito e inerte. O portão de aprovação humana antes de qualquer
   disparo é o motivo de essas ações existirem: nenhuma campanha sai
   sem alguém clicar em aprovar. */

export async function actionListarInsights() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return listarInsights(ctx.orgId);
}

export async function actionListarSugestoes() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return listarSugestoes(ctx.orgId);
}

export async function actionAprovarSugestao(sugestaoId: string) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const id = z.string().uuid().parse(sugestaoId);
  if (!ctx.userId) throw new Error("Usuário não identificado.");
  await aprovarSugestao(ctx.orgId, id, ctx.userId);
}

export async function actionRejeitarSugestao(sugestaoId: string, motivo = "Rejeitado pelo operador") {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  const id = z.string().uuid().parse(sugestaoId);
  await rejeitarSugestao(ctx.orgId, id, z.string().trim().min(3).max(500).parse(motivo));
}

/* `new Date(ano, mes-1, dia)` e `setHours(0,0,0,0)` nascem à meia-noite do fuso
   do PROCESSO, não do Brasil — e em produção (Vercel) o processo roda em UTC.
   Isso deslocava a janela do Pós-venda em 3 horas: entravam pedidos das 21h às
   24h do dia anterior ao escolhido e saíam os das 21h às 24h do último dia, o
   que fazia "Cumprimento de pedidos" divergir do Faturamento do mesmo card,
   que usa o offset fixo. Brasil não observa horário de verão desde 2019, então
   -03:00 vale o ano inteiro — mesma correção já feita em `dashboard.service.ts`
   e `saude-loja.service.ts`. */
function parseDataLocal(iso: string, fimDoDia: boolean): Date {
  return new Date(`${iso}T${fimDoDia ? "23:59:59.999" : "00:00:00.000"}-03:00`);
}

function resolverJanela(inicio?: string, fim?: string) {
  if (inicio && fim) {
    return { inicio: parseDataLocal(inicio, false), fim: parseDataLocal(fim, true) };
  }
  const agora = new Date();
  const hojeSaoPaulo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const inicioJanela = parseDataLocal(hojeSaoPaulo, false);
  inicioJanela.setDate(inicioJanela.getDate() - 29);
  return { inicio: inicioJanela, fim: agora };
}
