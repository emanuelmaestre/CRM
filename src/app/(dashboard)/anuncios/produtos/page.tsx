import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import anunciosConfig from "@/config/anuncios.json";
import { ProdutosClienteDetalhe } from "./produtos-cliente";

export const metadata = { title: anunciosConfig.produtosDetalhe.metadataTitle };

export default function ProdutosDetalhePage() {
  return (
    <div>
      <Link
        href="/anuncios"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.produtosDetalhe.voltar}
      </Link>
      <PageHeader
        title={anunciosConfig.produtosDetalhe.title}
        description={anunciosConfig.produtosDetalhe.description}
      />
      <ProdutosClienteDetalhe />
    </div>
  );
}
