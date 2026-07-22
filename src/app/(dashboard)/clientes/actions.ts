"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  atualizarCliente, buscarCliente360, criarCliente, listarClientes, arquivarCliente,
} from "@/modules/clientes/application/clientes.service";

const ClienteIdSchema = z.string().uuid();

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
  const result = await listarClientes(ctx, { busca: busca?.trim(), limit: 50 });
  return {
    ...result,
    permissions: { canArchive: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
}

export async function actionArquivarCliente(id: string) {
  const ctx = await getCrudContext();
  await arquivarCliente(ctx, ClienteIdSchema.parse(id));
  revalidatePath("/clientes");
}

export async function actionBuscarCliente360(id: string) {
  const ctx = await getCrudContext();
  return buscarCliente360(ctx, ClienteIdSchema.parse(id));
}

export async function actionAtualizarCliente(id: string, formData: FormData) {
  const clienteId = ClienteIdSchema.parse(id);
  const ctx = await getCrudContext();
  const atualizado = await atualizarCliente(ctx, clienteId, {
    nome: formData.get("nome") as string,
    email: (formData.get("email") as string) || null,
    telefone: (formData.get("telefone") as string) || null,
    cpfCnpj: (formData.get("cpfCnpj") as string) || null,
  });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return atualizado;
}
