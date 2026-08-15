import { AnunciosCliente } from "./anuncios-cliente";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.anuncios.metadataTitle };

export default function AnunciosPage() {
  return <AnunciosCliente />;
}
