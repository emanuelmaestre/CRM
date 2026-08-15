import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import anunciosConfig from "@/config/anuncios.json";
import { ComparacaoClienteDetalhe } from "./comparacao-cliente";

export const metadata = { title: anunciosConfig.comparacaoDetalhe.metadataTitle };

export default function ComparacaoDetalhePage() {
  return (
    <div>
      <Link
        href="/anuncios"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.comparacaoDetalhe.voltar}
      </Link>
      <PageHeader
        title={anunciosConfig.comparacaoDetalhe.title}
        description={anunciosConfig.comparacaoDetalhe.description}
      />
      <ComparacaoClienteDetalhe />
    </div>
  );
}
