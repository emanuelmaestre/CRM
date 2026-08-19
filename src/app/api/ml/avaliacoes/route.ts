import { NextResponse } from "next/server";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { listarAvaliacoesDoCache } from "@/modules/canais/application/avaliacoes-cache";

/** Continua servindo o recarregamento em segundo plano da tela de Avaliações.
 *  A primeira carga não passa mais por aqui: a página busca o mesmo cache no
 *  próprio servidor (ver avaliacoes/page.tsx). A leitura é compartilhada, então
 *  as duas nunca divergem. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin", "gestor"]);
  if (!auth.ok) return auth.response;

  return NextResponse.json(await listarAvaliacoesDoCache(auth.contexto.orgId));
}
