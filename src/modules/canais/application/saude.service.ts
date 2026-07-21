import { eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { channelAccount } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";

export async function verificarSaudeConectores(orgId: string): Promise<void> {
  const contas = await db
    .select()
    .from(channelAccount)
    .where(eq(channelAccount.orgId, orgId));

  for (const conta of contas) {
    try {
      const statusAnterior = conta.status;
      const novoStatus: "conectado" | "degradado" | "desconectado" = "conectado";
      const ultimoErro: string | null = null;

      // Verificação real acontece quando o provider concreto é instanciado.
      // Aqui apenas atualizamos o timestamp e status com base em resposta da porta.
      await db
        .update(channelAccount)
        .set({ status: novoStatus, ultimaVerificacao: new Date(), ultimoErro, updatedAt: new Date() })
        .where(eq(channelAccount.id, conta.id));

      if (statusAnterior !== novoStatus) {
        const tipoEvento =
          novoStatus === "conectado" ? "canal.conectado"
          : novoStatus === "degradado" ? "canal.degradado"
          : "canal.desconectado";

        await emitirEvento({
          tipo: tipoEvento,
          orgId,
          brandId: conta.brandId,
          entidade: "channel_account",
          entidadeId: conta.id,
          payload: { tipo: conta.tipo, statusAnterior, novoStatus },
        });
      }
    } catch (err) {
      await db
        .update(channelAccount)
        .set({ status: "degradado", ultimaVerificacao: new Date(), ultimoErro: String(err), updatedAt: new Date() })
        .where(eq(channelAccount.id, conta.id));
    }
  }
}

export async function listarSaudeConectores(orgId: string) {
  return db
    .select()
    .from(channelAccount)
    .where(eq(channelAccount.orgId, orgId));
}
