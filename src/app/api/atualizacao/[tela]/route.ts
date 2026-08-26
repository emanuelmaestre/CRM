import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { PERFIS } from "@/shared/lib/auth/authorization";
import {
  obterPainelAtualizacao,
  TELAS_ATUALIZAVEIS,
  type TelaAtualizavel,
} from "@/modules/canais/application/painel-atualizacao.service";

/* ── Por que uma rota e não uma Server Action ───────────────────────────
   O cabeçalho consulta a atualidade a cada 45s (5s enquanto sincroniza).
   Como Server Action, essa consulta entrava na MESMA fila serializada das
   ações que a pessoa dispara — o filtro clicado esperava o poll terminar
   antes de sair. Num GET comum ela sai da fila e corre em paralelo.

   Continua valendo a regra do módulo: isto lê só o banco local. Nenhuma
   chamada a marketplace acontece por abrir a tela ou trocar filtro. */

export const dynamic = "force-dynamic";

function ehTela(valor: string): valor is TelaAtualizavel {
  return (TELAS_ATUALIZAVEIS as readonly string[]).includes(valor);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tela: string }> },
): Promise<NextResponse> {
  const auth = await authorizeRoute(PERFIS);
  if (!auth.ok) return auth.response;

  const { tela } = await params;
  if (!ehTela(tela)) {
    return NextResponse.json({ error: "Tela desconhecida." }, { status: 404 });
  }

  const painel = await obterPainelAtualizacao({
    db,
    orgId: auth.contexto.orgId,
    userId: auth.contexto.userId,
    perfil: auth.contexto.perfil,
  }, tela);

  return NextResponse.json(painel, {
    headers: {
      // O poll já tem o seu próprio ritmo; o que este cabeçalho evita é o
      // navegador reaproveitar uma resposta velha ao voltar o foco na aba.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
