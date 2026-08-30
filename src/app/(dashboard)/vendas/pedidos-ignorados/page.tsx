import { requirePageAuth } from "@/shared/lib/auth/session";
import { PedidosIgnoradosLista } from "./pedidos-ignorados-lista";
import { actionListarPedidosIgnorados } from "./actions";

export const metadata = { title: "Pedidos ignorados" };

export default async function PedidosIgnoradosPage({ searchParams }: {
  searchParams: Promise<{ historico?: string }>;
}) {
  await requirePageAuth();

  const { historico } = await searchParams;
  const incluirFechados = historico === "1";

  // Resolvido no servidor pelo mesmo motivo de /vendas e /estoque: a lista
  // viaja dentro do HTML da primeira resposta, em vez de uma ida extra do
  // navegador depois que o JavaScript carrega.
  const resultado = await actionListarPedidosIgnorados(incluirFechados).catch(() => null);
  if (!resultado) return <p role="alert" className="m-6 rounded-lg border border-red-400 p-4">Não foi possível carregar os pedidos não importados. A fila não foi confirmada como vazia. Recarregue a página ou confira a conexão com o banco.</p>;
  const { linhas, permissions } = resultado;

  return (
    <PedidosIgnoradosLista
      linhas={linhas}
      podeDescartar={permissions.podeDescartar}
      incluirFechados={incluirFechados}
    />
  );
}
