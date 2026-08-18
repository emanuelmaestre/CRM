"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import { listarNotificacoesRecentes } from "@/modules/notificacoes/application/notificacoes.service";

export async function actionListarNotificacoes() {
  return listarNotificacoesRecentes(await getCrudContext());
}
