import { medirTempo } from "@/shared/lib/observability/medir-tempo";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { identificarCompradoresDeOpinioes } from "@/modules/canais/application/identificacao-avaliacao.service";

const EntradaSchema = z.object({
  itens: z.array(z.object({
    listingId: z.string().min(1),
    opinioes: z.array(z.object({
      id: z.string().min(1),
      criadaEm: z.string().nullable(),
    })),
  })),
});

/** Cruza opinião com pedido para sugerir quem comprou — só devolve quando há
 *  exatamente um comprador candidato na janela de tempo (ver
 *  identificacao-avaliacao.service.ts); nunca um "provável" ambíguo. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRoute(["admin", "gestor"]);
  if (!auth.ok) return auth.response;

  const input = EntradaSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
  }

  const mapa = await medirTempo(
    `avaliacoes/identificar (${input.data.itens.length} anuncios)`,
    () => identificarCompradoresDeOpinioes(auth.contexto.orgId, input.data.itens),
  );
  return NextResponse.json({ identificacoes: Object.fromEntries(mapa) });
}
