import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import anunciosConfig from "@/config/anuncios.json";
import { RentabilidadeClienteDetalhe } from "./rentabilidade-cliente";

export const metadata = { title: anunciosConfig.rentabilidadeDetalhe.metadataTitle };

export default function RentabilidadeDetalhePage() {
  return (
    <div>
      <Link
        href="/anuncios"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.rentabilidadeDetalhe.voltar}
      </Link>
      <PageHeader
        title={anunciosConfig.rentabilidadeDetalhe.title}
        description={anunciosConfig.rentabilidadeDetalhe.description}
      />
      <RentabilidadeClienteDetalhe />
    </div>
  );
}
