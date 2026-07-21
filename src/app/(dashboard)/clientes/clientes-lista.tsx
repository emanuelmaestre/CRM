"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { actionListarClientes, actionArquivarCliente } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";

type Cliente = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cpfCnpj?: string | null;
  createdAt?: string | Date;
};

export function ClientesLista() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const carregar = useCallback((q?: string) => {
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarClientes(q);
        setClientes(res.data as Cliente[]);
        setTotal(res.total);
      } catch {
        toast.error("Erro ao carregar clientes.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    setBusca(e.target.value);
    carregar(e.target.value || undefined);
  }

  async function handleArquivar(id: string, nome: string) {
    if (!confirm(`Arquivar "${nome}"?`)) return;
    try {
      await actionArquivarCliente(id);
      toast.success("Cliente arquivado.");
      carregar(busca || undefined);
    } catch {
      toast.error("Erro ao arquivar cliente.");
    }
  }

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes 360°</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Base unificada por organização — motor de identidade ativo</p>
        </div>
        <button
          onClick={() => router.push("/clientes/novo")}
          className="h-10 px-4 rounded-[0.75rem] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(227,19,27,.3)]"
          style={{ background: "var(--gradient-signature)" }}
        >
          + Novo cliente
        </button>
      </motion.div>

      {/* Busca */}
      <div className="mb-4">
        <input
          value={busca}
          onChange={handleBusca}
          placeholder="Buscar por nome, e-mail ou telefone…"
          className="w-full sm:w-80 h-10 px-3 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Tabela */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Base de clientes</p>
          <span className="text-xs text-muted-foreground">{total} {total === 1 ? "cliente" : "clientes"}</span>
        </div>

        {loading ? (
          <div>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : clientes.length === 0 ? (
          <EmptyState
            illustration="clients"
            title={busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description={busca ? "Tente outro termo de busca." : "Importe sua base ou adicione o primeiro cliente manualmente."}
            action={
              !busca ? (
                <button
                  onClick={() => router.push("/clientes/novo")}
                  className="h-10 px-5 rounded-[0.75rem] text-sm font-semibold text-white"
                  style={{ background: "var(--gradient-signature)" }}
                >
                  + Novo cliente
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">E-mail</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">WhatsApp</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    whileHover={{ backgroundColor: "rgba(0,0,0,0.018)" }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3.5 font-medium text-foreground">{c.nome}</td>
                    <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">{c.email ?? "—"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">{c.telefone ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleArquivar(c.id, c.nome)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Arquivar
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
