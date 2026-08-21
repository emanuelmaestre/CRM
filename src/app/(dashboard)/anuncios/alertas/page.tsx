import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import anunciosConfig from "@/config/anuncios.json";
import { AlertasClienteDetalhe } from "./alertas-cliente";

export const metadata = { title: anunciosConfig.alertasDetalhe.metadataTitle };

export default function AlertasDetalhePage() {
  return (
    <div>
      <Link
        href="/publicidade"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> {anunciosConfig.alertasDetalhe.voltar}
      </Link>
      <PageHeader
        title={anunciosConfig.alertasDetalhe.title}
        description={anunciosConfig.alertasDetalhe.description}
      />
      <AlertasClienteDetalhe />
    </div>
  );
}
