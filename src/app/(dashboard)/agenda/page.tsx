import pagesConfig from "@/config/pages.json";
import { TarefasTabs } from "../tarefas/tarefas-tabs";
import { AgendaLista } from "./agenda-lista";

export const metadata = { title: pagesConfig.agenda.metadataTitle };

export default function AgendaPage() {
  return <><TarefasTabs active="agenda" /><AgendaLista /></>;
}
