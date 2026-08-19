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
  const [marcasAtivas, setMarcasAtivas] = useState<ReadonlySet<string>>(new Set());
  const [canaisAtivos, setCanaisAtivos] = useState<ReadonlySet<string>>(new Set());
  const [contagens, setContagens] = useState<{ marcas: Record<string, number>; canais: Record<string, number> }>({ marcas: {}, canais: {} });

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
          linha inteira e centraliza sozinha. Mesmo empilhamento de sempre
          no mobile (canal em cima, empresa embaixo), uma linha só no
          desktop. */}
      <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-center lg:gap-3">
        <div className="w-full overflow-x-auto overscroll-x-contain px-0.5 scrollbar-thin flex justify-center lg:hidden">
          <CanaisRow canaisAtivos={canaisAtivos} onToggleCanal={alternarCanal} contagemCanal={contagens.canais} />
        </div>
        <div className="w-full overflow-x-auto overscroll-x-contain px-0.5 scrollbar-thin flex justify-center lg:hidden">
          <EmpresasRow marcasAtivas={marcasAtivas} onToggleMarca={alternarMarca} contagemMarca={contagens.marcas} />
        </div>

        <div className="hidden lg:block min-w-0 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-thin">
          <FiltroEscopoBar
            marcasAtivas={marcasAtivas}
            canaisAtivos={canaisAtivos}
            onToggleMarca={alternarMarca}
            onToggleCanal={alternarCanal}
            contagemMarca={contagens.marcas}
            contagemCanal={contagens.canais}
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
