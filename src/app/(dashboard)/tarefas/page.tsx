import pagesConfig from "@/config/pages.json";
import { TarefasTabs } from "./tarefas-tabs";
import { TarefasLista } from "./tarefas-lista";

export const metadata = { title: pagesConfig.tarefas.metadataTitle };

export default function TarefasPage() {
  return <><TarefasTabs active="tarefas" /><TarefasLista /></>;
}
