import pagesConfig from "@/config/pages.json";
import { VendasTabs } from "../vendas-tabs";
import { requirePageAuth } from "@/shared/lib/auth/session";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { PedidosLista } from "./pedidos-lista";

export const metadata = { title: pagesConfig.pedidos.metadataTitle };

export default async function PedidosPage() {
  await requirePageAuth();

  return (
    <>
      <VendasTabs active="pedidos" />
      <PageHeader
        title={pagesConfig.pedidos.title}
        description={pagesConfig.pedidos.description}
        className="mb-6"
      />
      <PedidosLista />
    </>
  );
}
