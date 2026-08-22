import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import anunciosConfig from "@/config/anuncios.json";
import { ComparacaoClienteDetalhe } from "./comparacao-cliente";

export const metadata = { title: anunciosConfig.comparacaoDetalhe.metadataTitle };

export default function ComparacaoDetalhePage() {
  return (
    <div>
      <Link
        href="/publicidade"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.comparacaoDetalhe.voltar}
      </Link>
      <ComparacaoClienteDetalhe />
    </div>
  );
}
