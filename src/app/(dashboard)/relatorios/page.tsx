import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { RelatoriosCliente } from "./relatorios-cliente";

export const metadata = { title: "Relatórios" };

export default function RelatoriosPage() {
  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Vendas por canal, sugestões de campanha e painel executivo"
      />
      <RelatoriosCliente />
    </div>
  );
}
