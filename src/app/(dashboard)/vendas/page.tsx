import pagesConfig from "@/config/pages.json";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { PedidosLista } from "./pedidos/pedidos-lista";
import { actionObterFiltrosPedidos } from "./actions";

export const metadata = { title: pagesConfig.pedidos.metadataTitle };

/* Mesmo motivo do /clientes e do /estoque: as contagens que desenham as
   pílulas de filtro vinham em duas idas ao servidor feitas pelo navegador,
   depois que o JavaScript carregava. Resolvidas aqui, viajam dentro do HTML
   da primeira resposta e a tela nasce com os filtros prontos. */
export default async function VendasPage() {
  await requirePageAuth();

  const { marcas, canais } = await actionObterFiltrosPedidos()
    .catch(() => ({ marcas: [], canais: [] }));

  return <PedidosLista marcasIniciais={marcas} canaisIniciais={canais} />;
}
