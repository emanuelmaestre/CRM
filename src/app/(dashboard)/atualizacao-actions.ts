"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  obterPainelAtualizacao,
  TELAS_ATUALIZAVEIS,
} from "@/modules/canais/application/painel-atualizacao.service";
import { dispararSincronizacaoConta } from "@/modules/canais/application/sincronizacao.service";
import { MODULOS_SINCRONIZACAO } from "@/modules/canais/domain/sincronizacao-progresso";
import { REPUTACAO_CACHE_TAG } from "@/modules/metricas/application/reputacao.service";
import { PUBLICACOES_CACHE_TAG } from "@/modules/metricas/application/publicacoes.service";

const TelaSchema = z.enum(TELAS_ATUALIZAVEIS);
const ModuloSchema = z.enum(MODULOS_SINCRONIZACAO);

export async function actionObterPainelAtualizacao(tela: unknown) {
  return obterPainelAtualizacao(await getCrudContext(), TelaSchema.parse(tela));
}

export async function actionDispararAtualizacaoModulo(input: unknown) {
  const parsed = z.object({
    channelAccountId: z.string().uuid(),
    modulo: ModuloSchema,
  }).parse(input);
  const ctx = await getCrudContext();
  const execucao = await dispararSincronizacaoConta(ctx, parsed.channelAccountId, { modulos: [parsed.modulo] });
  if (parsed.modulo === "reputacao") revalidateTag(REPUTACAO_CACHE_TAG, "max");
  if (parsed.modulo === "anuncios") revalidateTag(PUBLICACOES_CACHE_TAG, "max");
  for (const path of ["/vendas", "/avaliacoes", "/estoque", "/metricas", "/anuncios", "/configuracoes"]) {
    revalidatePath(path);
  }
  return execucao;
}

