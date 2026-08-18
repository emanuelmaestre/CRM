"use server";

import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  listarConversas,
  listarMensagens,
  enviarMensagem,
  avancarStatusConversa,
  listarPerguntas,
  responderPergunta,
  sincronizarConversasMercadoLivre,
} from "@/modules/inbox/application/inbox.service";
import type { ConversaStatus } from "@/modules/inbox/domain/state-machine";

/** Next.js redige a mensagem de erros lançados (throw) em Server Function
 *  em produção — o cliente só recebe "An error occurred in the Server
 *  Components render...", não o texto real (ex.: "Envios externos
 *  desabilitados até a liberação de go-live."). Erros de regra de negócio
 *  esperados (gate de go-live, validação de domínio) por isso viram valor
 *  de retorno em vez de throw, como a doc do Next recomenda pra "expected
 *  errors"; only bugs de fato devem seguir lançando. */
type ResultadoAcao<T> = { ok: true; dados: T } | { ok: false; mensagem: string };

async function paraResultado<T>(tarefa: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    return { ok: true, dados: await tarefa() };
  } catch (error) {
    return { ok: false, mensagem: error instanceof Error ? error.message : "Não foi possível concluir a ação." };
  }
}

export async function actionListarConversas(opts: { brandId?: string; status?: string } = {}) {
  const ctx = await getCrudContext();
  return listarConversas(ctx.orgId, { ...opts, limit: 200 });
}

export async function actionSincronizarConversas() {
  const ctx = await getCrudContext();
  return sincronizarConversasMercadoLivre(ctx.orgId);
}

export async function actionListarMensagens(conversaId: string) {
  const ctx = await getCrudContext();
  return listarMensagens(ctx.orgId, conversaId);
}

export async function actionEnviarMensagem(conversaId: string, conteudo: string) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  z.string().trim().min(1).max(350).parse(conteudo);
  return paraResultado(() => enviarMensagem(ctx, conversaId, conteudo.trim()));
}

export async function actionAvancarStatusConversa(conversaId: string, novoStatus: ConversaStatus) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  return paraResultado(() => avancarStatusConversa(ctx, conversaId, novoStatus));
}

export async function actionListarPerguntas(opts: { brandId?: string } = {}) {
  const ctx = await getCrudContext();
  return listarPerguntas(ctx.orgId, opts);
}

export async function actionResponderPergunta(conversaId: string, conteudo: string) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  z.string().trim().min(1).max(2000).parse(conteudo);
  return paraResultado(() => responderPergunta(ctx, conversaId, conteudo.trim()));
}
