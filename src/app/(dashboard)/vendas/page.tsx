import { VendasFunil } from "./vendas-funil";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.vendas.metadataTitle };

export default function VendasPage() {
  return <VendasFunil />;
}
