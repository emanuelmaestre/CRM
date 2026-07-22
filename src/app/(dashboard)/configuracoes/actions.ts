"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { atualizarUsuario, listarUsuarios } from "@/modules/usuarios/application/usuarios.service";

export async function actionListarUsuarios() {
  return listarUsuarios(await getCrudContext());
}

export async function actionAtualizarUsuario(input: unknown) {
  const resultado = await atualizarUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}
