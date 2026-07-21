import { eq, and, desc } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { documentoGerado } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { gerarDocumentoExecutivo } from "@/modules/ai/application/ai.service";
import type { CrudContext } from "@/shared/lib/crud-factory";

export type TipoDocumento = "relatorio_executivo" | "proposta" | "minuta";

export interface SolicitacaoDocumento {
  tipo: TipoDocumento;
  periodo: string;
  dadosKpis?: {
    receitaTotal: number;
    totalPedidos: number;
    canaisAtivos: number;
    clientesEmRisco: number;
    sugestoesPendentes: number;
  };
}

export async function gerarDocumento(
  ctx: CrudContext,
  solicitacao: SolicitacaoDocumento,
): Promise<{ documentoId: string; nomeArquivo: string; conteudo: Record<string, unknown> }> {
  const nomeArquivo = `${solicitacao.tipo}-${new Date().toISOString().slice(0, 10)}.pdf`;

  let conteudo: Record<string, unknown>;

  if (solicitacao.tipo === "relatorio_executivo" && solicitacao.dadosKpis) {
    const output = await gerarDocumentoExecutivo(
      ctx.orgId,
      { ...solicitacao.dadosKpis, periodo: solicitacao.periodo },
      ctx.userId ?? undefined,
    );
    conteudo = output as unknown as Record<string, unknown>;
  } else {
    conteudo = { tipo: solicitacao.tipo, periodo: solicitacao.periodo, geradoEm: new Date().toISOString() };
  }

  const [doc] = await db
    .insert(documentoGerado)
    .values({
      orgId: ctx.orgId,
      tipo: solicitacao.tipo,
      nomeArquivo,
      dadosOrigem: { solicitacao, conteudo } as unknown as Record<string, unknown>,
      geradoPorId: ctx.userId ?? undefined,
      storageUrl: null,
    })
    .returning();

  await emitirEvento({
    tipo: "documento.gerado",
    orgId: ctx.orgId,
    entidade: "documento_gerado",
    entidadeId: doc.id,
    payload: { tipo: solicitacao.tipo, nomeArquivo },
  });

  return { documentoId: doc.id, nomeArquivo, conteudo };
}

export async function listarDocumentos(orgId: string, limite = 10) {
  return db
    .select()
    .from(documentoGerado)
    .where(eq(documentoGerado.orgId, orgId))
    .orderBy(desc(documentoGerado.createdAt))
    .limit(limite);
}

export async function buscarDocumento(orgId: string, documentoId: string) {
  return db
    .select()
    .from(documentoGerado)
    .where(and(eq(documentoGerado.id, documentoId), eq(documentoGerado.orgId, orgId)))
    .then((r) => r[0] ?? null);
}
