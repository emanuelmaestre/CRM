import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { AnunciosCliente } from "./anuncios-cliente";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.anuncios.metadataTitle };

export default function AnunciosPage() {
  return (
    <div>
      <PageHeader
        title={pagesConfig.anuncios.title}
        description={pagesConfig.anuncios.description}
      />
      <AnunciosCliente />
    </div>
  );
}
