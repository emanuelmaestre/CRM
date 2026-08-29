import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { PERFIS } from "@/shared/lib/auth/authorization";
import {
  TELAS_ATUALIZAVEIS,
  type TelaAtualizavel,
} from "@/modules/canais/application/painel-atualizacao.service";
import {
  iniciarAtualizacaoTela,
  obterEstadoAtualizacaoTela,
} from "@/modules/canais/application/atualizacao-inteligente.service";

/* GET devolve somente o estado compacto usado pelo carregamento percentual.
   POST prepara a atualização incremental da tela. A fila pesada continua no
   Inngest; esta requisição nunca segura uma conexão esperando marketplace. */

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

  const estado = await obterEstadoAtualizacaoTela({
    db,
    orgId: auth.contexto.orgId,
    userId: auth.contexto.userId,
    perfil: auth.contexto.perfil,
  }, tela);

  return NextResponse.json(estado, {
    headers: {
      // O poll já tem o seu próprio ritmo; o que este cabeçalho evita é o
      // navegador reaproveitar uma resposta velha ao voltar o foco na aba.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ tela: string }> },
): Promise<NextResponse> {
  const auth = await authorizeRoute(PERFIS);
  if (!auth.ok) return auth.response;

  const { tela } = await params;
  if (!ehTela(tela)) {
    return NextResponse.json({ error: "Tela desconhecida." }, { status: 404 });
  }

  const estado = await iniciarAtualizacaoTela({
    db,
    orgId: auth.contexto.orgId,
    userId: auth.contexto.userId,
    perfil: auth.contexto.perfil,
  }, tela);

  return NextResponse.json(estado, {
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}
