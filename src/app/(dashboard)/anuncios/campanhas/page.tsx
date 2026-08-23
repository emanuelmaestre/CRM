import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import anunciosConfig from "@/config/anuncios.json";
import { CampanhasClienteDetalhe } from "./campanhas-cliente";

export const metadata = { title: anunciosConfig.campanhasDetalhe.metadataTitle };

export default function CampanhasDetalhePage() {
  return (
    <div>
      {/* Só no desktop — no mobile este link muda de lugar (mesma linha do
          "Atualizado em", ver campanhas-cliente.tsx) pra caber a informação
          de sincronização sem precisar de mais uma fileira. */}
      <Link
        href="/publicidade"
        className="mb-3 hidden items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
      >
        <ArrowLeft size={13} /> {anunciosConfig.campanhasDetalhe.voltar}
      </Link>
      <CampanhasClienteDetalhe />
    </div>
  );
}
