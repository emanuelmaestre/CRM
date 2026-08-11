import pagesConfig from "@/config/pages.json";
import { VendasTabs } from "../vendas-tabs";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { PedidosLista } from "./pedidos-lista";

export const metadata = { title: pagesConfig.pedidos.metadataTitle };

export default async function PedidosPage() {
  await requirePageAuth();

  return (
    <>
      <VendasTabs active="pedidos" />
      <div className="mt-6">
        <PedidosLista />
      </div>
    </>
  );
}
