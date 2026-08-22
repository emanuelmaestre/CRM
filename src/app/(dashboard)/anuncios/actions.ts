"use server";

import { medirTempo } from "@/shared/lib/observability/medir-tempo";
import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { obterVisaoGeral, type VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import { obterAnunciosDaCampanha, type AnuncioDaCampanha } from "@/modules/anuncios/application/campanha-detalhe.service";
import { obterProdutosDaMarca, type ProdutosResultado } from "@/modules/anuncios/application/produtos.service";
import { obterHistoricoDaMarca, type PontoHistorico } from "@/modules/anuncios/application/historico.service";

const PERFIS = ["admin", "gestor"] as const;

const FiltrosSchema = z.object({
  brandIds: z.array(z.string().uuid()).max(20).optional(),
  inicio: z.string().date().optional(),
  fim: z.string().date().optional(),
});

export async function actionObterVisaoGeralAnuncios(
  filtros: { brandIds?: string[]; inicio?: string; fim?: string } = {},
): Promise<VisaoGeralResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return medirTempo("anuncios/visao-geral", () => obterVisaoGeral(ctx, FiltrosSchema.parse(filtros)));
}

const AnunciosDaCampanhaSchema = z.object({
  brandId: z.string().uuid(),
  campanhaId: z.string().min(1),
});

export async function actionObterAnunciosDaCampanha(
  filtros: { brandId: string; campanhaId: string },
): Promise<AnuncioDaCampanha[]> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return obterAnunciosDaCampanha(ctx, AnunciosDaCampanhaSchema.parse(filtros));
}

const ProdutosDaMarcaSchema = z.object({
  brandId: z.string().uuid(),
});

export async function actionObterProdutosDaMarca(
  filtros: { brandId: string },
): Promise<ProdutosResultado> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return obterProdutosDaMarca(ctx, ProdutosDaMarcaSchema.parse(filtros));
}

const HistoricoDaMarcaSchema = z.object({
  brandId: z.string().uuid(),
  dias: z.number().int().min(1).max(180).optional(),
  inicio: z.string().date().optional(),
  fim: z.string().date().optional(),
});

export async function actionObterHistoricoDaMarca(
  filtros: { brandId: string; dias?: number; inicio?: string; fim?: string },
): Promise<PontoHistorico[]> {
  const ctx = await getCrudContext();
  assertPerfil(ctx, [...PERFIS]);
  return obterHistoricoDaMarca(ctx, HistoricoDaMarcaSchema.parse(filtros));
}
