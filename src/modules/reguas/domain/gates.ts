import { db } from "@/shared/lib/db";
import { consentimento, reguaExecucao, templateMensagem } from "@/shared/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface GateInput {
  orgId: string;
  clienteId: string;
  brandId: string;
  finalidade: "marketing" | "avaliacao" | "suporte" | "cobranca";
  canal: string;
  canalOrigem: string;
  idempotencyKey: string;
  templateId: string;
  horaAtual?: Date;
}

export interface GateResult {
  aprovado: boolean;
  gateBloqueado?: string;
  motivo?: string;
}

export async function avaliarGates(input: GateInput): Promise<GateResult> {
  // Gate 1 — Opt-in registrado para finalidade + canal + marca
  const optIn = await db
    .select()
    .from(consentimento)
    .where(
      and(
        eq(consentimento.clienteId, input.clienteId),
        eq(consentimento.orgId, input.orgId),
        eq(consentimento.brandId, input.brandId),
        eq(consentimento.finalidade, input.finalidade),
        eq(consentimento.canal, input.canal as never),
        eq(consentimento.status, "ativo")
      )
    )
    .then((r) => r[0]);

  if (!optIn) {
    return { aprovado: false, gateBloqueado: "gate_1", motivo: "Sem opt-in registrado para esta finalidade/canal/marca" };
  }

  // Gate 2 — Canal permitido para origem (cliente de marketplace não sai pelo canal)
  const canaisMarketplace = ["mercadolivre", "shopee", "tiktokshop", "olist"];
  if (canaisMarketplace.includes(input.canalOrigem) && input.canal !== input.canalOrigem) {
    return { aprovado: false, gateBloqueado: "gate_2", motivo: `Cliente de ${input.canalOrigem} não pode ser abordado fora do canal de origem` };
  }

  // Gate 3 — Sigilo de marca: template pertence à mesma marca
  const template = await db
    .select()
    .from(templateMensagem)
    .where(
      and(
        eq(templateMensagem.id, input.templateId),
        eq(templateMensagem.brandId, input.brandId),
        eq(templateMensagem.orgId, input.orgId)
      )
    )
    .then((r) => r[0]);

  if (!template) {
    return { aprovado: false, gateBloqueado: "gate_3", motivo: "Template não pertence à marca do pedido — violação de sigilo entre marcas" };
  }

  if (template.aprovado !== "true") {
    return { aprovado: false, gateBloqueado: "gate_6", motivo: "Template não aprovado" };
  }

  // Gate 4 — Idempotência: chave única + cooldown
  const execucaoExistente = await db
    .select()
    .from(reguaExecucao)
    .where(eq(reguaExecucao.idempotencyKey, input.idempotencyKey))
    .then((r) => r[0]);

  if (execucaoExistente) {
    return { aprovado: false, gateBloqueado: "gate_4", motivo: `Disparo duplicado — idempotency_key já existe: ${input.idempotencyKey}` };
  }

  // Gate 5 — Janela de horário comercial (8h–20h) + dia útil
  const hora = (input.horaAtual ?? new Date()).getHours();
  const diaSemana = (input.horaAtual ?? new Date()).getDay();
  const fimDeSemana = diaSemana === 0 || diaSemana === 6;

  if (hora < 8 || hora >= 20 || fimDeSemana) {
    return { aprovado: false, gateBloqueado: "gate_5", motivo: `Fora da janela comercial (hora=${hora}, diaSemana=${diaSemana})` };
  }

  // Gate 6 — Template aprovado (já verificado no gate 3, redundância intencional)
  return { aprovado: true };
}
