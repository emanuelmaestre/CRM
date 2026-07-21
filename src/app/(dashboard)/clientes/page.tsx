import { ClientesLista } from "./clientes-lista";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.clientes.metadataTitle };

export default function ClientesPage() {
  return <ClientesLista />;
}
