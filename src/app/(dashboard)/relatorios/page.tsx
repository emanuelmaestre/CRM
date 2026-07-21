import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

export const metadata = { title: "Relatórios" };

const relatorios = [
  { titulo: "Vendas por canal", descricao: "Receita e pedidos por marketplace e marca", fase: "C", icone: "📊" },
  { titulo: "Clientes — RFM", descricao: "Segmentação por recência, frequência e valor", fase: "C", icone: "👥" },
  { titulo: "Estoque — giro e encalhe", descricao: "SKUs sem venda e capital parado", fase: "C", icone: "📦" },
  { titulo: "Réguas — entregabilidade", descricao: "Disparos, bloqueios e taxa de abertura", fase: "C", icone: "📨" },
  { titulo: "Painel executivo", descricao: "Visão consolidada KARZI + WUWU", fase: "C", icone: "📈" },
  { titulo: "Trilha de auditoria", descricao: "Todas as ações por usuário e período", fase: "C", icone: "🔍" },
];

export default function RelatoriosPage() {
  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Exportáveis em PDF e XLSX — por período, canal, marca e vendedor"
      />

      <div className="rounded-[1.25rem] border border-border bg-card p-5 mb-6 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-[0.75rem] bg-muted flex items-center justify-center text-xl flex-shrink-0">⏳</div>
        <div>
          <p className="text-sm font-semibold text-foreground">Disponíveis na Fase C</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Os relatórios executivos são gerados após a integração dos canais de venda e a coleta de dados reais.
          </p>
        </div>
      </div>

      <SectionCard title="Sugestões de campanha" description="Aguardam aprovação" className="mb-6">
        <EmptyState
          illustration="inbox"
          title="Nenhuma sugestão pendente"
          description="A IA gera sugestões semanalmente com base nos scores de churn."
        />
      </SectionCard>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {relatorios.map((r) => (
          <div key={r.titulo} className="rounded-[1.25rem] border border-border bg-card p-5 opacity-60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[0.75rem] bg-muted flex items-center justify-center text-xl flex-shrink-0">
                {r.icone}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{r.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.descricao}</p>
                <span className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  Fase {r.fase}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
