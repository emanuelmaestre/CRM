import { medirTempo } from "@/shared/lib/observability/medir-tempo";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/shared/lib/auth/session";
import { identificarCompradoresDeOpinioes, vincularAvaliacoesAPedidos } from "@/modules/canais/application/identificacao-avaliacao.service";

const EntradaSchema = z.object({
  itens: z.array(z.object({
    listingId: z.string().min(1),
    opinioes: z.array(z.object({
      id: z.string().min(1),
      criadaEm: z.string().nullable(),
    })),
  })),
  /* Avaliações da Shopee, que trazem o pedido de origem no próprio comentário.
     Vêm à parte de `itens` porque não passam pelo cruzamento por janela de
     tempo — são junção por chave, com resposta certa ou nenhuma. */
  vinculos: z.array(z.object({
    id: z.string().min(1),
    pedidoCanal: z.string().min(1),
  })).optional(),
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

  const vinculos = input.data.vinculos ?? [];
  const [mapa, mapaVinculos] = await Promise.all([
    medirTempo(
      `avaliacoes/identificar (${input.data.itens.length} anuncios)`,
      () => identificarCompradoresDeOpinioes(auth.contexto.orgId, input.data.itens),
    ),
    vinculos.length === 0
      ? Promise.resolve(new Map())
      : medirTempo(
        `avaliacoes/vincular (${vinculos.length} avaliacoes da Shopee)`,
        () => vincularAvaliacoesAPedidos(auth.contexto.orgId, vinculos),
      ),
  ]);
  return NextResponse.json({
    identificacoes: Object.fromEntries(mapa),
    pedidos: Object.fromEntries(mapaVinculos),
  });
}
