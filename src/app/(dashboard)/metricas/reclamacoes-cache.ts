import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/shared/lib/db";
import { obterReclamacoesAbertas } from "@/modules/metricas/application/reclamacoes.service";

/** Uma única chave por organização atende tanto Saúde quanto o card. A função
 * fica neste módulo compartilhado para os dois caminhos não criarem caches
 * paralelos com o mesmo dado externo. */
export function obterReclamacoesMetricasComCache(orgId: string) {
  const obterComCache = unstable_cache(
    () => obterReclamacoesAbertas({ db, orgId, perfil: "gestor" }),
    ["metricas-reclamacoes", orgId],
    { revalidate: 90, tags: [`reclamacoes-${orgId}`] },
  );
  return obterComCache();
}
