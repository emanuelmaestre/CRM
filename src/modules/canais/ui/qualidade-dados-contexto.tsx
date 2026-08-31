"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, PackageX } from "lucide-react";
import { Dialog } from "@/shared/design-system/primitives/Dialog";

const QualidadeDadosContexto = createContext<ReactNode>(null);
const classeBotao = "press-feedback inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

/** O conteúdo continua vindo do servidor, sem duplicar a consulta de integridade. */
export function QualidadeDadosProvider({ pagina, aviso, children }: { pagina: "/vendas" | "/estoque"; aviso: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return <QualidadeDadosContexto.Provider value={aviso}>
    {pathname !== pagina && aviso}
    {children}
  </QualidadeDadosContexto.Provider>;
}

export function NaoImportadosVendas({ quantidade }: { quantidade: number }) {
  const aviso = useContext(QualidadeDadosContexto);
  const [aberto, setAberto] = useState(false);
  return <>
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      title="Pedidos não importados e alertas de integridade dos canais"
      className={classeBotao}
    >
      <PackageX size={14} aria-hidden="true" />
      Não importados
      <span className="rounded-full bg-amber-500/15 px-1.5 tabular-nums">{quantidade}</span>
    </button>
    <Dialog
      open={aberto}
      onOpenChange={setAberto}
      title="Não importados e alertas dos canais"
      description="Consulte a fila de pedidos e os avisos de conexão e estoque de todas as empresas, independentemente dos filtros da lista."
      className="sm:max-w-4xl"
    >
      <Link href="/vendas/pedidos-ignorados" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted">
        <PackageX size={16} aria-hidden="true" /> Abrir fila de pedidos não importados
      </Link>
      <div className="mt-4 min-w-0 [&>aside]:m-0">{aviso}</div>
    </Dialog>
  </>;
}

export function AlertasEstoque() {
  const aviso = useContext(QualidadeDadosContexto);
  const [aberto, setAberto] = useState(false);
  return <>
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      title="Consultar a integridade dos dados e os alertas de estoque e conexão"
      className={classeBotao}
    >
      <AlertTriangle size={14} aria-hidden="true" /> Alertas dos canais
    </button>
    <Dialog
      open={aberto}
      onOpenChange={setAberto}
      title="Alertas dos canais"
      description="Avisos de estoque, conexão e pedidos de todas as empresas, independentemente dos filtros da lista de produtos."
      className="sm:max-w-4xl"
    >
      <div className="min-w-0 [&>aside]:m-0">{aviso}</div>
    </Dialog>
  </>;
}
