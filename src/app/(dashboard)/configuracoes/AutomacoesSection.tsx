"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import settingsConfig from "@/config/settings.json";
import { actionListarHistoricoAutomacoes } from "./actions";

const copy = settingsConfig.automacoes;

type Historico = Awaited<ReturnType<typeof actionListarHistoricoAutomacoes>>;

function dataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

/** Histórico das réguas de relacionamento.
 *
 *  Deixou de ser um módulo próprio no menu: é só leitura e, sem régua
 *  cadastrada, permanece vazio — não sustenta um item de navegação. Como seção
 *  de Configurações fica junto do resto da operação, onde é consultada. */
export function AutomacoesSection() {
  const [dados, setDados] = useState<Historico | null>(null);

  const carregar = useCallback(() => {
    actionListarHistoricoAutomacoes()
      .then(setDados)
      .catch(() => {
        setDados({ execucoes: [], reguasCadastradas: 0 });
        toast.error(copy.loadError);
      });
  }, []);

  useEffect(carregar, [carregar]);

  if (dados === null) return <SkeletonRow />;

  if (dados.execucoes.length === 0) {
    // Distingue os dois vazios: sem régua nenhuma, não há o que executar — e
    // dizer só "nenhuma execução" faria parecer defeito. Com régua cadastrada,
    // o vazio passa a ser informação real (nada disparou ainda).
    const semRegua = dados.reguasCadastradas === 0;
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-5">
        <p className="text-sm text-muted-foreground">
          {semRegua ? copy.emptyNoRules : copy.emptyNoRuns}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            {copy.columns.map((coluna) => (
              <th key={coluna} className="px-3 py-2 font-semibold">{coluna}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dados.execucoes.map((item) => (
            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 whitespace-nowrap">{dataHora(item.createdAt)}</td>
              <td className="px-3 py-2.5 font-semibold">{item.reguaNome}</td>
              <td className="px-3 py-2.5">{item.clienteNome}</td>
              <td className="px-3 py-2.5">{item.brandNome}</td>
              <td className="px-3 py-2.5 capitalize">{item.status.replaceAll("_", " ")}</td>
              <td className="px-3 py-2.5">{item.gate ?? "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{item.motivo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
