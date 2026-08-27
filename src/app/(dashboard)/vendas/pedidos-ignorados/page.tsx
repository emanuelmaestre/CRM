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
  const { linhas, permissions } = await actionListarPedidosIgnorados(incluirFechados)
    .catch(() => ({ linhas: [], permissions: { podeDescartar: false } }));

  return (
    <PedidosIgnoradosLista
      linhasIniciais={linhas}
      podeDescartar={permissions.podeDescartar}
      incluirFechados={incluirFechados}
    />
  );
}
