// Roda a sincronização de Product Ads (Publicidade) sob demanda, sem passar
// pela fila do Inngest — útil em dev quando não há worker do Inngest rodando
// localmente (o botão "Sincronizar agora" da tela só enfileira o evento; sem
// worker, o evento nunca é processado). Reaproveita o serviço real do módulo.
//
// Uso:
//   node --env-file=.env.local --import tsx scripts/sincronizar-anuncios.mts karzi

import type { BrandSlug } from "@/shared/config/brands";

const { db } = await import("@/shared/lib/db");
const { sincronizarAnunciosMercadoLivre } = await import("@/modules/anuncios/application/sincronizacao.service");

const marcaSlug = process.argv[2] as BrandSlug | undefined;

const orgId = process.env.DEFAULT_ORG_ID;
if (!orgId) throw new Error("DEFAULT_ORG_ID não encontrada — defina no ambiente ou em .env.local.");

const ctx = { db, orgId, perfil: "admin" as const };

const resultados = await sincronizarAnunciosMercadoLivre(ctx);
const filtrados = marcaSlug ? resultados.filter((r) => r.brandSlug === marcaSlug) : resultados;

console.log(JSON.stringify(filtrados, null, 2));
