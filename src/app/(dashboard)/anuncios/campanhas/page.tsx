import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import anunciosConfig from "@/config/anuncios.json";
import { CampanhasClienteDetalhe } from "./campanhas-cliente";

export const metadata = { title: anunciosConfig.campanhasDetalhe.metadataTitle };

export default function CampanhasDetalhePage() {
  return (
    <div>
      <Link
        href="/anuncios"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.campanhasDetalhe.voltar}
      </Link>
      <PageHeader
        title={anunciosConfig.campanhasDetalhe.title}
        description={anunciosConfig.campanhasDetalhe.description}
      />
      <CampanhasClienteDetalhe />
    </div>
  );
}
