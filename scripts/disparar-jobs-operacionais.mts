/**
 * Dispara A34 e/ou A35 pelo Inngest Cloud sem esperar o próximo cron.
 * Os eventos usam `INNGEST_EVENT_KEY`; os jobs continuam duráveis e deixam
 * seus registros normais em `job_run`.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/disparar-jobs-operacionais.mts
 *   node --env-file=.env.local --import tsx scripts/disparar-jobs-operacionais.mts a34
 *   node --env-file=.env.local --import tsx scripts/disparar-jobs-operacionais.mts a35
 */
import { randomUUID } from "node:crypto";
import { inngest } from "../src/shared/lib/inngest/client";
import {
  EVENTO_AUDITAR_FINANCEIRO,
  EVENTO_RECONCILIAR_PEDIDOS,
} from "../src/modules/jobs/eventos-operacionais";

const alvo = (process.argv[2] ?? "todos").toLowerCase();
if (!new Set(["a34", "a35", "todos"]).has(alvo)) {
  throw new Error("Alvo inválido. Use a34, a35 ou todos.");
}

const solicitadoEm = new Date().toISOString();
const eventos = [
  ...(alvo === "a34" || alvo === "todos"
    ? [{
        id: `operacao-a34-${randomUUID()}`,
        name: EVENTO_RECONCILIAR_PEDIDOS,
        data: { origem: "script-operacional", solicitadoEm },
      }]
    : []),
  ...(alvo === "a35" || alvo === "todos"
    ? [{
        id: `operacao-a35-${randomUUID()}`,
        name: EVENTO_AUDITAR_FINANCEIRO,
        data: { origem: "script-operacional", solicitadoEm },
      }]
    : []),
];

const resposta = await inngest.send(eventos);
console.log(JSON.stringify({ alvo, eventos: eventos.map((evento) => evento.name), ids: resposta.ids }, null, 2));
