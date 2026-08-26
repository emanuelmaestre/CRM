"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { dispararSincronizacaoConta } from "@/modules/canais/application/sincronizacao.service";
import { MODULOS_SINCRONIZACAO } from "@/modules/canais/domain/sincronizacao-progresso";
import { REPUTACAO_CACHE_TAG } from "@/modules/metricas/application/reputacao.service";
import { PUBLICACOES_CACHE_TAG } from "@/modules/metricas/application/publicacoes.service";

/* A leitura do painel saiu daqui e virou GET em /api/atualizacao/[tela].
   Server Action é uma fila serializada: enquanto o polling do cabeçalho
   ocupava essa fila, a ação que a pessoa acabou de disparar esperava.
   O que sobrou aqui é o que de fato muda estado. */

const ModuloSchema = z.enum(MODULOS_SINCRONIZACAO);

export async function actionDispararAtualizacaoModulo(input: unknown) {
  const parsed = z.object({
    channelAccountId: z.string().uuid(),
    modulo: ModuloSchema,
  }).parse(input);

  const ctx = await getCrudContext();
  const execucao = await dispararSincronizacaoConta(ctx, parsed.channelAccountId, {
    modulos: [parsed.modulo],
  });

  /* Só as tags dos dois caches que sobrevivem a requisição (reputação e
     publicações ficam em unstable_cache). O revalidatePath das seis rotas
     saiu: invalidava o app inteiro no instante do clique, quando o job nem
     começou a rodar — o dado novo chega depois, e quem percebe a chegada é
     a checagem de versão. */
  if (parsed.modulo === "reputacao") revalidateTag(REPUTACAO_CACHE_TAG, "max");
  if (parsed.modulo === "anuncios") revalidateTag(PUBLICACOES_CACHE_TAG, "max");

  return { id: execucao.id, iniciadoEm: execucao.iniciadoEm.toISOString() };
}
