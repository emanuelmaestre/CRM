import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import {
  consentimento,
  regua,
  reguaExecucao,
  templateMensagem,
} from "@/shared/lib/db/schema";

const STATUS_DISPARO_CONCLUIDO = [
  "gates_aprovados",
  "agendada",
  "enviada",
  "confirmada",
] as const;

export interface GateInput {
  orgId: string;
  reguaId: string;
  clienteId: string;
  brandId: string;
  finalidade: "marketing" | "avaliacao" | "suporte" | "cobranca";
  canal: string;
  canalOrigem: string;
  idempotencyKey: string;
  templateId: string;
  cooldownHoras: number;
  limiteDiarioCliente: number;
  horaAtual?: Date;
}

export interface GateResult {
  aprovado: boolean;
  gateBloqueado?: string;
  motivo?: string;
}

export function obterHorarioSaoPaulo(data: Date): {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  diaSemana: string;
} {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return {
    ano: Number(valor("year")),
    mes: Number(valor("month")),
    dia: Number(valor("day")),
    hora: Number(valor("hour")),
    diaSemana: valor("weekday"),
  };
}

function intervaloDiaSaoPaulo(data: Date): { inicio: Date; fim: Date } {
  const { ano, mes, dia } = obterHorarioSaoPaulo(data);
  // O Brasil não adota horário de verão desde 2019; São Paulo permanece em UTC-3.
  const inicio = new Date(Date.UTC(ano, mes - 1, dia, 3));
  return { inicio, fim: new Date(inicio.getTime() + 24 * 60 * 60 * 1_000) };
}

export async function avaliarGates(input: GateInput): Promise<GateResult> {
  const agora = input.horaAtual ?? new Date();

  // Gate 1 — opt-in registrado para finalidade, canal e marca.
  const optIn = await db
    .select({ id: consentimento.id })
    .from(consentimento)
    .where(
      and(
        eq(consentimento.clienteId, input.clienteId),
        eq(consentimento.orgId, input.orgId),
        eq(consentimento.brandId, input.brandId),
        eq(consentimento.finalidade, input.finalidade),
        eq(consentimento.canal, input.canal as never),
        eq(consentimento.status, "ativo"),
      ),
    )
    .then((rows) => rows[0]);

  if (!optIn) {
    return { aprovado: false, gateBloqueado: "gate_1", motivo: "Sem consentimento registrado para esta finalidade, canal e marca" };
  }

  // Gate 2 — contatos originados em marketplace permanecem no canal de origem.
  const canaisMarketplace = ["mercadolivre", "shopee", "tiktokshop"];
  if (canaisMarketplace.includes(input.canalOrigem) && input.canal !== input.canalOrigem) {
    return { aprovado: false, gateBloqueado: "gate_2", motivo: `Cliente de ${input.canalOrigem} não pode ser abordado fora do canal de origem` };
  }

  // Gates 3 e 6 — isolamento de marca e template aprovado.
  const template = await db
    .select()
    .from(templateMensagem)
    .where(
      and(
        eq(templateMensagem.id, input.templateId),
        eq(templateMensagem.brandId, input.brandId),
        eq(templateMensagem.orgId, input.orgId),
        eq(templateMensagem.canal, input.canal),
      ),
    )
    .then((rows) => rows[0]);

  if (!template) {
    return { aprovado: false, gateBloqueado: "gate_3", motivo: "O modelo de mensagem não pertence à marca do pedido, o que viola o sigilo entre marcas" };
  }
  if (template.aprovado !== "true") {
    return { aprovado: false, gateBloqueado: "gate_6", motivo: "Modelo de mensagem não aprovado" };
  }

  // Gate 4 — chave exata e cooldown por régua/cliente.
  const execucaoExistente = await db
    .select({ id: reguaExecucao.id })
    .from(reguaExecucao)
    .where(and(eq(reguaExecucao.orgId, input.orgId), eq(reguaExecucao.idempotencyKey, input.idempotencyKey)))
    .then((rows) => rows[0]);

  if (execucaoExistente) {
    return { aprovado: false, gateBloqueado: "gate_4", motivo: `Disparo duplicado, o identificador da operação já existe: ${input.idempotencyKey}` };
  }

  const inicioCooldown = new Date(agora.getTime() - input.cooldownHoras * 60 * 60 * 1_000);
  const disparoNoCooldown = await db
    .select({ id: reguaExecucao.id })
    .from(reguaExecucao)
    .where(
      and(
        eq(reguaExecucao.orgId, input.orgId),
        eq(reguaExecucao.reguaId, input.reguaId),
        eq(reguaExecucao.clienteId, input.clienteId),
        inArray(reguaExecucao.status, [...STATUS_DISPARO_CONCLUIDO]),
        gte(reguaExecucao.createdAt, inicioCooldown),
      ),
    )
    .then((rows) => rows[0]);

  if (disparoNoCooldown) {
    return { aprovado: false, gateBloqueado: "gate_4", motivo: `O cliente ainda está no intervalo de espera de ${input.cooldownHoras} hora(s) desta régua` };
  }

  // Gate 5 — dias úteis, 08h–20h em São Paulo e limite diário por cliente/marca.
  const horario = obterHorarioSaoPaulo(agora);
  const fimDeSemana = horario.diaSemana === "Sun" || horario.diaSemana === "Sat";
  if (horario.hora < 8 || horario.hora >= 20 || fimDeSemana) {
    return { aprovado: false, gateBloqueado: "gate_5", motivo: `Fora da janela comercial de São Paulo (hora=${horario.hora}, dia=${horario.diaSemana})` };
  }

  const { inicio, fim } = intervaloDiaSaoPaulo(agora);
  const [{ total }] = await db
    .select({ total: count() })
    .from(reguaExecucao)
    .innerJoin(regua, eq(regua.id, reguaExecucao.reguaId))
    .where(
      and(
        eq(reguaExecucao.orgId, input.orgId),
        eq(reguaExecucao.clienteId, input.clienteId),
        eq(regua.brandId, input.brandId),
        inArray(reguaExecucao.status, [...STATUS_DISPARO_CONCLUIDO]),
        gte(reguaExecucao.createdAt, inicio),
        lt(reguaExecucao.createdAt, fim),
      ),
    );

  if (total >= input.limiteDiarioCliente) {
    return { aprovado: false, gateBloqueado: "gate_5", motivo: `Limite diário de ${input.limiteDiarioCliente} disparo(s) atingido para este cliente e marca` };
  }

  return { aprovado: true };
}
