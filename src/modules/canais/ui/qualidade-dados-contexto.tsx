"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/shared/design-system/primitives/Dialog";

const QualidadeDadosContexto = createContext<ReactNode>(null);
const classeBotao = "press-feedback inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

/** O conteúdo continua vindo do servidor, sem duplicar a consulta de integridade. */
export function QualidadeDadosProvider({ pagina, aviso, children }: { pagina: "/estoque"; aviso: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return <QualidadeDadosContexto.Provider value={aviso}>
    {pathname !== pagina && aviso}
    {children}
  </QualidadeDadosContexto.Provider>;
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
