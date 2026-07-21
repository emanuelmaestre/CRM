import { PageHeader } from "@/shared/design-system/primitives/PageHeader";

export const metadata = { title: "Mensagens" };

const canais = [
  { nome: "WhatsApp KARZI", descricao: "Z-API · instância KARZI", icone: "💬", marca: "KARZI", cor: "var(--karzi)" },
  { nome: "WhatsApp WUWU", descricao: "Z-API · instância WUWU", icone: "💬", marca: "WUWU", cor: "var(--wuwu)" },
  { nome: "Shopee", descricao: "Chat da loja · pedidos e pós-venda", icone: "🛍️", marca: "—", cor: "var(--muted-foreground)" },
  { nome: "Mercado Livre", descricao: "Perguntas e mensagens pós-venda", icone: "🛒", marca: "—", cor: "var(--muted-foreground)" },
  { nome: "TikTok Shop", descricao: "Mensagens da loja", icone: "🎵", marca: "—", cor: "var(--muted-foreground)" },
];

export default function InboxPage() {
  return (
    <div>
      <PageHeader
        title="Mensagens"
        description="Conversas unificadas — WhatsApp e marketplaces"
      />

      {/* Banner de fase */}
      <div className="rounded-[1.25rem] border border-border bg-card p-5 mb-6 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-[0.75rem] bg-muted flex items-center justify-center text-xl flex-shrink-0">🔌</div>
        <div>
          <p className="text-sm font-semibold text-foreground">Conectores pendentes — Fase B</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            As conversas aparecerão aqui após configurar as credenciais de cada canal abaixo.
            Configure as chaves em <span className="font-medium text-foreground">Configurações → Integrações</span>.
          </p>
        </div>
      </div>

      {/* Grade de canais */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {canais.map((c) => (
          <div key={c.nome} className="rounded-[1.25rem] border border-border bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[0.75rem] bg-muted flex items-center justify-center text-xl flex-shrink-0">
              {c.icone}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{c.nome}</p>
              <p className="text-xs text-muted-foreground truncate">{c.descricao}</p>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              Pendente
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
