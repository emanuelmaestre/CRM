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
} from "@/modules/inbox/application/inbox.service";
import type { ConversaStatus } from "@/modules/inbox/domain/state-machine";

export async function actionListarConversas(opts: { brandId?: string; status?: string } = {}) {
  const ctx = await getCrudContext();
  return listarConversas(ctx.orgId, { ...opts, limit: 60 });
}

export async function actionListarMensagens(conversaId: string) {
  const ctx = await getCrudContext();
  return listarMensagens(ctx.orgId, conversaId);
}

export async function actionEnviarMensagem(conversaId: string, conteudo: string) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  z.string().trim().min(1).max(4096).parse(conteudo);
  return enviarMensagem(ctx, conversaId, conteudo.trim());
}

export async function actionAvancarStatusConversa(conversaId: string, novoStatus: ConversaStatus) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  return avancarStatusConversa(ctx, conversaId, novoStatus);
}

export async function actionListarPerguntas(opts: { brandId?: string } = {}) {
  const ctx = await getCrudContext();
  return listarPerguntas(ctx.orgId, opts);
}

export async function actionResponderPergunta(conversaId: string, conteudo: string) {
  const ctx = await getCrudContext();
  z.string().uuid().parse(conversaId);
  z.string().trim().min(1).max(2000).parse(conteudo);
  return responderPergunta(ctx, conversaId, conteudo.trim());
}
