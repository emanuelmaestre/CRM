import pagesConfig from "@/config/pages.json";
import { VendasTabs } from "../vendas/vendas-tabs";
import { TarefasLista } from "./tarefas-lista";

export const metadata = { title: pagesConfig.tarefas.metadataTitle };

export default function TarefasPage() {
  return <><VendasTabs active="tarefas" /><TarefasLista /></>;
}
