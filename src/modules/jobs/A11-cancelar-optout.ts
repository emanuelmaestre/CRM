import { inngest } from "@/shared/lib/inngest/client";
import { cancelarExecucoesCliente } from "@/modules/reguas/application/reguas.service";

export const A11_cancelarOptout = inngest.createFunction(
  { id: "A11-cancelar-optout", name: "A11 — Cancelar execuções agendadas no opt-out", triggers: [{ event: "cliente/consentimento-revogado" }] },
  async ({ event, step }) => {
    const { orgId, clienteId } = event.data as { orgId: string; clienteId: string };
    await step.run("cancelar-execucoes", () => cancelarExecucoesCliente(orgId, clienteId));
    return { clienteId, execucoesCanceladas: true };
  }
);
