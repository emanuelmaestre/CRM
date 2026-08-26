import { and, desc, eq, inArray, max } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  adsAnuncioSnapshot,
  auditLog,
  brand,
  channelAccount,
  cliente,
  estoqueCanalSaldo,
  importLote,
  mlAvaliacaoAnuncio,
  pedido,
  produto,
  produtoCanal,
  shopeeAvaliacaoAnuncio,
  sincronizacaoExecucao,
} from "@/shared/lib/db/schema";
import {
  CAMPOS_MODULO_SINCRONIZACAO,
  MODULOS_SINCRONIZACAO,
  progressoDoModulo,
  resultadoOmitido,
  type ModuloSincronizacao,
  type StatusModuloSincronizacao,
} from "../domain/sincronizacao-progresso";

export const TELAS_ATUALIZAVEIS = [
  "vendas",
  "avaliacoes",
  "estoque",
  "metricas",
  "anuncios",
  "configuracoes",
  "clientes",
  "importacao",
  "auditoria",
] as const;

export type TelaAtualizavel = (typeof TELAS_ATUALIZAVEIS)[number];

export const MODULOS_EXTERNOS_POR_TELA: Record<TelaAtualizavel, readonly ModuloSincronizacao[]> = {
  vendas: ["pedidos"],
  avaliacoes: ["avaliacoes"],
  estoque: ["catalogo"],
  metricas: ["pedidos", "avaliacoes", "reputacao"],
  anuncios: ["anuncios"],
  configuracoes: MODULOS_SINCRONIZACAO,
  clientes: ["pedidos"],
  importacao: [],
  auditoria: [],
};

const ROTULOS_MODULO: Record<ModuloSincronizacao, string> = {
  catalogo: "Catálogo e estoque",
  pedidos: "Pedidos",
  anuncios: "Anúncios",
  avaliacoes: "Avaliações",
  reputacao: "Reputação",
};

const ROTULOS_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

function iso(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/** Uma consulta de MAX por tabela é deliberadamente barata: o cabeçalho lê
 *  só o relógio/versão local, nunca as linhas nem qualquer marketplace. */
async function versaoDados(ctx: CrudContext, tela: TelaAtualizavel): Promise<string | null> {
  const executar = async (query: PromiseLike<Array<{ valor: Date | string | null }>>) =>
    query.then((rows) => iso(rows[0]?.valor));

  const pedidoMax = () => executar(ctx.db.select({ valor: max(pedido.updatedAt) }).from(pedido).where(eq(pedido.orgId, ctx.orgId)));
  const estoqueMax = () => executar(ctx.db.select({ valor: max(estoqueCanalSaldo.verificadoEm) }).from(estoqueCanalSaldo).where(eq(estoqueCanalSaldo.orgId, ctx.orgId)));
  const avaliacaoMlMax = () => executar(ctx.db.select({ valor: max(mlAvaliacaoAnuncio.atualizadoEm) }).from(mlAvaliacaoAnuncio).where(eq(mlAvaliacaoAnuncio.orgId, ctx.orgId)));
  const avaliacaoShopeeMax = () => executar(ctx.db.select({ valor: max(shopeeAvaliacaoAnuncio.atualizadoEm) }).from(shopeeAvaliacaoAnuncio).where(eq(shopeeAvaliacaoAnuncio.orgId, ctx.orgId)));
  const anunciosMax = () => executar(ctx.db.select({ valor: max(adsAnuncioSnapshot.criadoEm) }).from(adsAnuncioSnapshot).where(eq(adsAnuncioSnapshot.orgId, ctx.orgId)));

  let valores: Array<string | null>;
  switch (tela) {
    case "vendas": valores = [await pedidoMax()]; break;
    case "avaliacoes": valores = await Promise.all([avaliacaoMlMax(), avaliacaoShopeeMax()]); break;
    case "estoque": valores = await Promise.all([
      estoqueMax(),
      executar(ctx.db.select({ valor: max(produto.updatedAt) }).from(produto).where(eq(produto.orgId, ctx.orgId))),
      executar(ctx.db.select({ valor: max(produtoCanal.updatedAt) }).from(produtoCanal).where(eq(produtoCanal.orgId, ctx.orgId))),
    ]); break;
    case "metricas": valores = await Promise.all([
      pedidoMax(), estoqueMax(), avaliacaoMlMax(), avaliacaoShopeeMax(), anunciosMax(),
      executar(ctx.db.select({ valor: max(sincronizacaoExecucao.finalizadoEm) }).from(sincronizacaoExecucao).where(eq(sincronizacaoExecucao.orgId, ctx.orgId))),
    ]); break;
    case "anuncios": valores = [await anunciosMax()]; break;
    case "clientes": valores = [await executar(ctx.db.select({ valor: max(cliente.updatedAt) }).from(cliente).where(eq(cliente.orgId, ctx.orgId)))]; break;
    case "importacao": valores = [await executar(ctx.db.select({ valor: max(importLote.createdAt) }).from(importLote).where(eq(importLote.orgId, ctx.orgId)))]; break;
    case "auditoria": valores = [await executar(ctx.db.select({ valor: max(auditLog.createdAt) }).from(auditLog).where(eq(auditLog.orgId, ctx.orgId)))]; break;
    case "configuracoes": valores = [await executar(ctx.db.select({ valor: max(sincronizacaoExecucao.iniciadoEm) }).from(sincronizacaoExecucao).where(eq(sincronizacaoExecucao.orgId, ctx.orgId)))]; break;
  }
  return valores.filter((valor): valor is string => Boolean(valor)).sort().at(-1) ?? null;
}

export async function obterPainelAtualizacao(ctx: CrudContext, tela: TelaAtualizavel) {
  const [contas, execucoes, versao] = await Promise.all([
    ctx.db
      .select({
        id: channelAccount.id,
        tipo: channelAccount.tipo,
        nome: channelAccount.nome,
        brandId: channelAccount.brandId,
        brandSlug: brand.slug,
        brandLabel: brand.name,
      })
      .from(channelAccount)
      .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, ctx.orgId)))
      .where(and(
        eq(channelAccount.orgId, ctx.orgId),
        eq(channelAccount.status, "conectado"),
        inArray(channelAccount.tipo, ["mercadolivre", "shopee", "tiktokshop"]),
      ))
      .orderBy(brand.name, channelAccount.tipo),
    ctx.db
      .select()
      .from(sincronizacaoExecucao)
      .where(eq(sincronizacaoExecucao.orgId, ctx.orgId))
      .orderBy(desc(sincronizacaoExecucao.iniciadoEm))
      .limit(60),
    versaoDados(ctx, tela),
  ]);

  const ultimaPorConta = new Map<string, (typeof execucoes)[number]>();
  for (const execucao of execucoes) {
    if (!ultimaPorConta.has(execucao.channelAccountId)) ultimaPorConta.set(execucao.channelAccountId, execucao);
  }
  const permitidos = new Set(MODULOS_EXTERNOS_POR_TELA[tela]);
  const contasResultado = contas.map((conta) => {
    const execucao = ultimaPorConta.get(conta.id) ?? null;
    const modulos = execucao
      ? MODULOS_SINCRONIZACAO.flatMap((modulo) => {
          const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
          const resultado = execucao[campos.resultado];
          if (!permitidos.has(modulo) || resultadoOmitido(resultado)) return [];
          const status = execucao[campos.status] as StatusModuloSincronizacao;
          return [{
            modulo,
            label: ROTULOS_MODULO[modulo],
            status,
            progresso: progressoDoModulo(status, resultado),
            erro: execucao[campos.erro] as string | null,
          }];
        })
      : [];
    return {
      id: conta.id,
      canal: conta.tipo,
      canalLabel: ROTULOS_CANAL[conta.tipo] ?? conta.nome,
      brandId: conta.brandId,
      brandSlug: conta.brandSlug,
      brandLabel: conta.brandLabel,
      modulosDisponiveis: MODULOS_EXTERNOS_POR_TELA[tela].filter((modulo) => (
        modulo !== "anuncios" || conta.tipo === "mercadolivre"
      )),
      execucao: execucao ? {
        id: execucao.id,
        emAndamento: !execucao.finalizadoEm && modulos.length > 0,
        iniciadoEm: execucao.iniciadoEm.toISOString(),
        finalizadoEm: execucao.finalizadoEm?.toISOString() ?? null,
        progresso: modulos.length > 0
          ? Math.round(modulos.reduce((total, item) => total + item.progresso, 0) / modulos.length)
          : 100,
        modulos,
      } : null,
    };
  });

  const ativas = contasResultado.flatMap((conta) => conta.execucao?.emAndamento ? [conta.execucao] : []);
  const progresso = ativas.length > 0
    ? Math.round(ativas.reduce((total, execucao) => total + execucao.progresso, 0) / ativas.length)
    : 100;
  const ultimaConcluida = contasResultado
    .flatMap((conta) => conta.execucao?.finalizadoEm ? [conta.execucao.finalizadoEm] : [])
    .sort()
    .at(-1) ?? null;

  return {
    tela,
    versao,
    progresso,
    emAndamento: ativas.length > 0,
    ultimaConcluida,
    podeSincronizar: ctx.perfil === "admin" || ctx.perfil === "gestor",
    modulosDisponiveis: [...permitidos],
    contas: contasResultado,
  };
}
