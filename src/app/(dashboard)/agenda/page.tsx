import pagesConfig from "@/config/pages.json";
import { VendasTabs } from "../vendas/vendas-tabs";
import { AgendaLista } from "./agenda-lista";

export const metadata = { title: pagesConfig.agenda.metadataTitle };

export default function AgendaPage() {
  return <><VendasTabs active="agenda" /><AgendaLista /></>;
}
