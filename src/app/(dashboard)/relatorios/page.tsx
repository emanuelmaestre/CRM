import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { RelatoriosCliente } from "./relatorios-cliente";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.relatorios.metadataTitle };

export default function RelatoriosPage() {
  return (
    <div>
      <PageHeader
        title={pagesConfig.relatorios.title}
        description={pagesConfig.relatorios.description}
      />
      <RelatoriosCliente />
    </div>
  );
}
