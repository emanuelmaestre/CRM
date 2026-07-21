import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

export const metadata = { title: "Saúde do Sistema" };

export default function SaudePage() {
  return (
    <div>
      <PageHeader
        title="Saúde do Sistema"
        description="Conectores · Filas · Backups · Consumo de IA"
      />

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Conectores">
          <EmptyState
            illustration="generic"
            title="Sem conectores configurados"
            description="Configure as contas dos canais para monitorar a saúde aqui."
          />
        </SectionCard>

        <SectionCard title="Fila de jobs">
          <EmptyState
            illustration="generic"
            title="Nenhum job em execução"
            description="Jobs ativos e falhas aparecem aqui em tempo real."
          />
        </SectionCard>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Dead-letter (falhas definitivas)">
          <EmptyState
            illustration="alerts"
            title="Nenhuma falha definitiva"
            description="Jobs que esgotaram tentativas aparecem aqui para reprocessamento."
          />
        </SectionCard>

        <SectionCard title="Backups">
          <EmptyState
            illustration="generic"
            title="Aguardando primeiro backup"
            description="Backups diários automáticos. O último é exibido aqui."
          />
        </SectionCard>
      </div>
    </div>
  );
}
