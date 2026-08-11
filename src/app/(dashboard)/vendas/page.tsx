import pagesConfig from "@/config/pages.json";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { PedidosLista } from "./pedidos/pedidos-lista";

export const metadata = { title: pagesConfig.pedidos.metadataTitle };

export default async function VendasPage() {
  await requirePageAuth();

  return <PedidosLista />;
}
