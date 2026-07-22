import { EstoqueLista } from "./estoque-lista";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.estoque.metadataTitle };

export default function EstoquePage() {
  return <EstoqueLista />;
}
