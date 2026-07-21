"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { criarCliente, listarClientes, arquivarCliente } from "@/modules/clientes/application/clientes.service";

export async function actionCriarCliente(formData: FormData) {
  const ctx = await getCrudContext();
  const result = await criarCliente(ctx, {
    nome: formData.get("nome") as string,
    email: (formData.get("email") as string) || undefined,
    telefone: (formData.get("telefone") as string) || undefined,
    cpfCnpj: (formData.get("cpfCnpj") as string) || undefined,
  });
  revalidatePath("/clientes");
  return result;
}

export async function actionListarClientes(busca?: string) {
  const ctx = await getCrudContext();
  return listarClientes(ctx, { busca, limit: 50 });
}

export async function actionArquivarCliente(id: string) {
  const ctx = await getCrudContext();
  await arquivarCliente(ctx, id);
  revalidatePath("/clientes");
}
