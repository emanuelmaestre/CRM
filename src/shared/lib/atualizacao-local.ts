"use client";

import { useEffect, useRef } from "react";

export const EVENTO_ATUALIZAR_DADOS_LOCAIS = "crm:atualizar-dados-locais";

export type TelaAtualizacaoLocal =
  | "vendas"
  | "avaliacoes"
  | "estoque"
  | "metricas"
  | "anuncios"
  | "configuracoes"
  | "clientes"
  | "importacao"
  | "auditoria";

export function emitirAtualizacaoLocal(tela: TelaAtualizacaoLocal, versao?: string | null) {
  window.dispatchEvent(new CustomEvent(EVENTO_ATUALIZAR_DADOS_LOCAIS, {
    detail: { tela, versao: versao ?? null },
  }));
}

/** Mantém o callback atual sem reinstalar o listener a cada filtro digitado. */
export function useAtualizacaoLocal(tela: TelaAtualizacaoLocal, atualizar: () => void) {
  const atualizarRef = useRef(atualizar);
  useEffect(() => { atualizarRef.current = atualizar; }, [atualizar]);

  useEffect(() => {
    const ouvir = (evento: Event) => {
      const detalhe = (evento as CustomEvent<{ tela?: string }>).detail;
      if (detalhe?.tela === tela) atualizarRef.current();
    };
    window.addEventListener(EVENTO_ATUALIZAR_DADOS_LOCAIS, ouvir);
    return () => window.removeEventListener(EVENTO_ATUALIZAR_DADOS_LOCAIS, ouvir);
  }, [tela]);
}
