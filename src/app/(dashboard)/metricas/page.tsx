import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { MetricasCliente } from "./metricas-cliente";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.metricas.metadataTitle };

export default function MetricasPage() {
  return (
    <div>
      <PageHeader
        title={pagesConfig.metricas.title}
        description={pagesConfig.metricas.description}
      />
      <MetricasCliente />
    </div>
  );
}
