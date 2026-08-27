"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  ehPlataformaAnuncios,
  PLATAFORMA_ANUNCIOS_PADRAO,
  type PlataformaAnuncios,
} from "@/modules/anuncios/domain/plataformas";

/* ── Canal ativo do módulo Anúncios ───────────────────────────────
   O seletor de canal aparece nas cinco telas do módulo (visão geral,
   campanhas, produtos, histórico, comparação) e a escolha precisa sobreviver
   à navegação entre elas — senão o usuário escolhe Shopee em Anúncios, clica
   em "Ver produtos" e volta pro Mercado Livre sem entender por quê.

   Contexto no layout, com a escolha guardada no navegador. Não vai pra URL de
   propósito: os atalhos entre as telas são <Link> fixos, e propagar query
   string em cada um deles seria fácil de esquecer no próximo link novo.

   A leitura do localStorage passa por useSyncExternalStore em vez de um
   useState + useEffect: o servidor renderiza sem acesso ao armazenamento, e é
   esse hook que sabe entregar o valor do servidor na hidratação e o do
   navegador logo depois, sem descompasso de HTML e sem setState em efeito. */

const CHAVE_ARMAZENAMENTO = "anuncios:canal";

interface EstadoCanal {
  canal: PlataformaAnuncios;
  /** Falso enquanto o valor é o do servidor (que não lê o armazenamento).
   *  As telas usam isso pra não disparar uma busca no canal padrão que seria
   *  descartada meio segundo depois, já com o canal restaurado. */
  pronto: boolean;
}

const ESTADO_SERVIDOR: EstadoCanal = { canal: PLATAFORMA_ANUNCIOS_PADRAO, pronto: false };

// Snapshot precisa ser referencialmente estável: useSyncExternalStore compara
// por identidade e entraria em laço infinito se um objeto novo saísse a cada
// chamada. O objeto abaixo é reaproveitado enquanto o canal guardado não muda
// — e a comparação é feita contra o localStorage a cada leitura, não contra um
// valor lido uma vez só. Assim o armazenamento continua sendo a única fonte da
// verdade: quem escrever nele por fora (outra aba, o próprio usuário limpando
// os dados do site) é visto na leitura seguinte, sem cache velho no meio.
let estadoCliente: EstadoCanal | null = null;
const ouvintes = new Set<() => void>();

function lerArmazenamento(): PlataformaAnuncios {
  try {
    const guardado = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (ehPlataformaAnuncios(guardado)) return guardado;
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima, política do
    // sistema): segue no canal padrão, que é o comportamento de sempre.
  }
  return PLATAFORMA_ANUNCIOS_PADRAO;
}

function snapshotCliente(): EstadoCanal {
  const canal = lerArmazenamento();
  if (!estadoCliente || estadoCliente.canal !== canal) {
    estadoCliente = { canal, pronto: true };
  }
  return estadoCliente;
}

function snapshotServidor(): EstadoCanal {
  return ESTADO_SERVIDOR;
}

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function definirCanalNoStore(novo: PlataformaAnuncios): void {
  if (estadoCliente?.canal === novo) return;
  try {
    window.localStorage.setItem(CHAVE_ARMAZENAMENTO, novo);
  } catch {
    // Não poder lembrar a escolha não pode impedir de fazê-la: o estado em
    // memória abaixo mantém a troca funcionando nesta navegação.
  }
  estadoCliente = { canal: novo, pronto: true };
  avisar();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  // Duas abas abertas no módulo ficam em sincronia: o evento `storage` só
  // dispara nas OUTRAS abas, então é exatamente o caso que a escrita local
  // acima não cobre.
  const aoMudarArmazenamento = (evento: StorageEvent) => {
    if (evento.key !== CHAVE_ARMAZENAMENTO) return;
    // O snapshot relê o armazenamento sozinho; aqui só precisamos acordar
    // quem está inscrito.
    avisar();
  };
  window.addEventListener("storage", aoMudarArmazenamento);

  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", aoMudarArmazenamento);
  };
}

interface CanalAnunciosContexto extends EstadoCanal {
  definirCanal: (canal: PlataformaAnuncios) => void;
}

const Contexto = createContext<CanalAnunciosContexto | null>(null);

export function CanalAnunciosProvider({ children }: { children: React.ReactNode }) {
  const estado = useSyncExternalStore(assinar, snapshotCliente, snapshotServidor);
  const definirCanal = useCallback((novo: PlataformaAnuncios) => definirCanalNoStore(novo), []);
  const valor = useMemo(
    () => ({ canal: estado.canal, pronto: estado.pronto, definirCanal }),
    [estado.canal, estado.pronto, definirCanal],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Fora do provider (um teste montando o componente isolado, por exemplo) cai
 *  no canal padrão em vez de estourar — a tela continua sendo a de sempre. */
export function useCanalAnuncios(): CanalAnunciosContexto {
  return useContext(Contexto) ?? {
    canal: PLATAFORMA_ANUNCIOS_PADRAO,
    pronto: true,
    definirCanal: () => {},
  };
}
