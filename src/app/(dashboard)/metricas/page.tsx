import { Suspense } from "react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { Mosaico } from "./mosaico";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.metricas.metadataTitle };

export default function MetricasPage() {
  return (
    <div>
      <PageHeader title={pagesConfig.metricas.title} />
      {/* O mosaico lê o card aberto de `?card=` — useSearchParams exige um
          limite de Suspense para não forçar a página inteira a ser dinâmica. */}
      <Suspense fallback={null}>
        <Mosaico />
      </Suspense>
    </div>
  );
}
