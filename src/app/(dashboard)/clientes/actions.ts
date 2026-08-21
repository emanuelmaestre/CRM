"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  atualizarCliente, buscarCliente360, criarCliente, listarClientes, arquivarCliente,
  exportarDadosCliente, revogarConsentimento, criarAnotacaoCliente,
  contarClientesPorCanal, contarClientesPorMarca,
  criarTarefaCliente, concluirTarefaCliente,
} from "@/modules/clientes/application/clientes.service";

const ClienteIdSchema = z.string().uuid();
const BrandIdSchema = z.string().uuid();
const CanalVendaSchema = z.enum(["mercadolivre", "shopee", "tiktokshop"]);

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

export async function actionListarClientes(busca?: string, brandIds?: string[], canalTipos?: string[]) {
  const ctx = await getCrudContext();
  const brandIdsValidados = brandIds?.length ? z.array(BrandIdSchema).parse(brandIds) : undefined;
  const canalTiposValidados = canalTipos?.length ? z.array(CanalVendaSchema).parse(canalTipos) : undefined;
  const [result, marcas, canais] = await Promise.all([
    listarClientes(ctx, {
      busca: busca?.trim(),
      brandIds: brandIdsValidados,
      canalTipos: canalTiposValidados,
      limit: 50,
    }),
    contarClientesPorMarca(ctx, { canalTipos: canalTiposValidados }),
    contarClientesPorCanal(ctx, { brandIds: brandIdsValidados }),
  ]);
  return {
    ...result,
    marcas,
    canais,
    permissions: { canArchive: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
}

export async function actionContarClientesPorCanal(brandIds?: string[]) {
  const ctx = await getCrudContext();
  const brandIdsValidados = brandIds?.length ? z.array(BrandIdSchema).parse(brandIds) : undefined;
  return contarClientesPorCanal(ctx, { brandIds: brandIdsValidados });
}

export async function actionContarClientesPorMarca(canalTipos?: string[]) {
  const ctx = await getCrudContext();
  const canalTiposValidados = canalTipos?.length ? z.array(CanalVendaSchema).parse(canalTipos) : undefined;
  return contarClientesPorMarca(ctx, { canalTipos: canalTiposValidados });
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

export async function actionExportarDadosCliente(id: string) {
  const ctx = await getCrudContext();
  return exportarDadosCliente(ctx, ClienteIdSchema.parse(id));
}

export async function actionRevogarConsentimento(consentimentoId: string, clienteId: string) {
  const ctx = await getCrudContext();
  const parsedClienteId = ClienteIdSchema.parse(clienteId);
  const atualizado = await revogarConsentimento(ctx, ClienteIdSchema.parse(consentimentoId));
  revalidatePath(`/clientes/${atualizado.clienteId ?? parsedClienteId}`);
  return atualizado;
}

export async function actionCriarAnotacao(clienteId: string, texto: string) {
  const ctx = await getCrudContext();
  const nova = await criarAnotacaoCliente(ctx, { clienteId: ClienteIdSchema.parse(clienteId), texto });
  revalidatePath(`/clientes/${clienteId}`);
  return nova;
}

export async function actionObterFiltrosClientes() {
  const ctx = await getCrudContext();
  const [marcas, canais] = await Promise.all([
    contarClientesPorMarca(ctx),
    contarClientesPorCanal(ctx),
  ]);
  return { marcas, canais };
}

export async function actionCriarTarefaCliente(clienteId: string, titulo: string, responsavelId?: string, prazo?: string) {
  const ctx = await getCrudContext();
  const id = ClienteIdSchema.parse(clienteId);
  const tarefa = await criarTarefaCliente(ctx, { clienteId: id, titulo, responsavelId: responsavelId || null, prazo: prazo ? new Date(prazo).toISOString() : null });
  revalidatePath(`/clientes/${id}`);
  return tarefa;
}

export async function actionConcluirTarefaCliente(clienteId: string, tarefaId: string) {
  const ctx = await getCrudContext();
  const id = ClienteIdSchema.parse(clienteId);
  const tarefa = await concluirTarefaCliente(ctx, id, ClienteIdSchema.parse(tarefaId));
  revalidatePath(`/clientes/${id}`);
  return tarefa;
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
