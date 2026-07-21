import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

export const metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Organização, integrações, usuários, sistema e saúde"
      />

      {/* Organização e Integrações */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Organização">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between py-2 border-b border-border">
              <span>Marcas ativas</span>
              <span className="font-medium text-foreground">KARZI, WUWU</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Plano</span>
              <span className="font-medium text-foreground">Acelera</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Integrações">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>WhatsApp (Z-API)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>Shopee</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>Mercado Livre</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>TikTok Shop</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span>Inngest</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span>OpenAI</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendente</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Usuários">
          <div className="text-sm text-muted-foreground py-2">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-foreground">admin@crm.com.br</p>
                <p className="text-xs mt-0.5">Administrador</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#1F8A4C]/10 text-[#1F8A4C]">Ativo</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Sistema">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between py-2 border-b border-border">
              <span>Versão</span>
              <span className="font-medium text-foreground">LEO v1.0</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Ambiente</span>
              <span className="font-medium text-foreground">Desenvolvimento</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Saúde do Sistema */}
      <h2 className="text-[15px] font-bold text-foreground mb-4">Saúde do Sistema</h2>

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

      <div className="grid md:grid-cols-2 gap-4 mb-4">
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

      {/* Inteligência */}
      <h2 className="text-[15px] font-bold text-foreground mb-4">Inteligência</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Consumo de IA">
          <EmptyState
            illustration="reports"
            title="Sem dados de consumo"
            description="O consumo de tokens aparece aqui conforme a IA é utilizada."
          />
        </SectionCard>

        <SectionCard title="Insights do funil">
          <EmptyState
            illustration="funnel"
            title="Nenhum insight gerado"
            description="Insights semanais serão exibidos aqui após a integração de dados."
          />
        </SectionCard>
      </div>
    </div>
  );
}
