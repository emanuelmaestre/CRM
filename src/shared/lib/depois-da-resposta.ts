import { after } from "next/server";

/** Agenda trabalho curto que não deve atrasar a resposta HTTP. */
export function depoisDaResposta(tarefa: () => void | Promise<void>): void {
  after(tarefa);
}
