"use client";

import { useState } from "react";
import { AvaliacoesLista, type Avaliacao } from "./avaliacoes-lista";
import { FiltroEscopoBar, EmpresasRow, CanaisRow } from "./filtro-escopo";

export function AvaliacoesCliente({ itensIniciais }: {
  /** Avaliações já lidas do cache no servidor (ver page.tsx) — chegam dentro
   *  do HTML, então a lista aparece no primeiro quadro em vez de esperar o
   *  JavaScript ligar e só então pedir os dados de volta. */
  itensIniciais?: Avaliacao[];
}) {
  const contagensIniciais = () => {
    const marcas: Record<string, number> = {};
    const canais: Record<string, number> = {};
    for (const item of itensIniciais ?? []) {
      marcas[item.brand] = (marcas[item.brand] ?? 0) + 1;
      const canal = item.canal ?? "mercadolivre";
      canais[canal] = (canais[canal] ?? 0) + 1;
    }
    return { marcas, canais };
  };
  const [marcasAtivas, setMarcasAtivas] = useState<ReadonlySet<string>>(new Set());
  const [canaisAtivos, setCanaisAtivos] = useState<ReadonlySet<string>>(new Set());
  // As pílulas já nascem habilitadas com o cache entregue no HTML. Antes a
  // contagem só chegava num useEffect depois da hidratação, deixando os
  // botões visíveis porém intocáveis por alguns instantes.
  const [contagens, setContagens] = useState(contagensIniciais);

  function alternarMarca(slug: string) {
    setMarcasAtivas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(slug)) proximo.delete(slug); else proximo.add(slug);
      return proximo;
    });
  }

  function alternarCanal(tipo: string) {
    setCanaisAtivos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(tipo)) proximo.delete(tipo); else proximo.add(tipo);
      return proximo;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de escopo — empresa e canal. Antes dividia espaço com a barra
          de abas (Conversas/Perguntas/Avaliações); com só Avaliações
          sobrando, não há mais abas pra caber ao lado, então ela ocupa a
          linha inteira e centraliza sozinha. No mobile, empresa em cima e
          canal embaixo; uma linha só no desktop. */}
      <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-center lg:gap-3">
        <div className="w-full overflow-x-auto overscroll-x-contain px-0.5 py-2 scrollbar-none flex justify-center lg:hidden">
          <CanaisRow canaisAtivos={canaisAtivos} onToggleCanal={alternarCanal} />
        </div>
        <div className="w-full overflow-x-auto overscroll-x-contain px-0.5 py-2 scrollbar-none flex justify-center lg:hidden">
          <EmpresasRow marcasAtivas={marcasAtivas} onToggleMarca={alternarMarca} contagemMarca={contagens.marcas} />
        </div>

        <div className="hidden lg:block min-w-0 overflow-x-auto overscroll-x-contain px-0.5 py-2 scrollbar-none">
          <FiltroEscopoBar
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onToggleMarca={alternarMarca}
            onToggleCanal={alternarCanal}
            contagemMarca={contagens.marcas}
          />
        </div>
      </div>

      <AvaliacoesLista
        marcasAtivas={marcasAtivas}
        canaisAtivos={canaisAtivos}
        onContagens={setContagens}
        itensIniciais={itensIniciais}
      />
    </div>
  );
}
