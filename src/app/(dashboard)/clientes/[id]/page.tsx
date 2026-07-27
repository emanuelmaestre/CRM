import { notFound } from "next/navigation";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { buscarCliente360 } from "@/modules/clientes/application/clientes.service";
import { Cliente360 } from "./cliente-360";

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCrudContext();

  let data: Awaited<ReturnType<typeof buscarCliente360>>;
  try {
    data = await buscarCliente360(ctx, id);
  } catch (error) {
    if (error instanceof Error && error.message === "Cliente não encontrado.") notFound();
    throw error;
  }

  return (
    <Cliente360
      initialData={data}
      canArchive={ctx.perfil === "admin" || ctx.perfil === "gestor"}
      canManageLgpd={ctx.perfil === "admin" || ctx.perfil === "gestor"}
    />
  );
}
