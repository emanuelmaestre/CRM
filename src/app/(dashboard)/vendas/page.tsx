import { VendasFunil } from "./vendas-funil";
import { VendasTabs } from "./vendas-tabs";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.vendas.metadataTitle };

export default function VendasPage() {
  return <><VendasTabs active="funil" /><VendasFunil /></>;
}
