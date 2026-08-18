import { notFound } from "next/navigation";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { buscarProdutoDetalhe } from "@/modules/estoque/application/estoque.service";
import { ProdutoDetalhe } from "./produto-detalhe";

export default async function ProdutoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCrudContext();

  let data: Awaited<ReturnType<typeof buscarProdutoDetalhe>>;
  try {
    data = await buscarProdutoDetalhe(ctx, id);
  } catch (error) {
    if (error instanceof Error && error.message === "Produto não encontrado.") notFound();
    throw error;
  }

  return <ProdutoDetalhe initialData={data} />;
}
