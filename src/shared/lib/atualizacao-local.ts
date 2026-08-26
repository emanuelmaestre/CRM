"use client";

import { useEffect, useRef } from "react";
import type { FonteVersao } from "@/modules/canais/domain/versao-fontes";
import type { TelaAtualizavel } from "@/modules/canais/application/painel-atualizacao.service";

export const EVENTO_ATUALIZAR_DADOS_LOCAIS = "crm:atualizar-dados-locais";

/** Mesma lista de telas do serviço — declarar de novo aqui já deixou as duas
 *  fora de sincronia uma vez e obrigava um cast em cada emissão. */
export type TelaAtualizacaoLocal = TelaAtualizavel;

type DetalheAtualizacao = {
  tela: TelaAtualizacaoLocal;
  versao: string | null;
  /** Quais fontes mudaram de versão desde a checagem anterior. Vazio quando
   *  o pedido é manual ("Atualizar dados da tela") — aí tudo é releitura. */
  fontes: readonly FonteVersao[];
};

export function emitirAtualizacaoLocal(
  tela: TelaAtualizacaoLocal,
  versao?: string | null,
  fontes: readonly FonteVersao[] = [],
) {
  window.dispatchEvent(new CustomEvent<DetalheAtualizacao>(EVENTO_ATUALIZAR_DADOS_LOCAIS, {
    detail: { tela, versao: versao ?? null, fontes },
  }));
}

/**
 * Reage quando os dados locais da tela mudaram — porque uma rotina gravou algo
 * ou porque a pessoa pediu releitura. Nunca dispara chamada externa: o callback
 * relê o banco, e só.
 *
 * `fontes` filtra por origem do dado. Sem ele, o callback roda a cada mudança
 * da tela. Com ele, roda só quando aquela origem mudou — é o que evita que um
 * pedido novo derrube o cartão de estoque em Métricas. Emissão manual (sem
 * fontes) sempre passa: quem clicou pediu tudo.
 */
export function useAtualizacaoLocal(
  tela: TelaAtualizacaoLocal,
  atualizar: () => void,
  opcoes: { fontes?: readonly FonteVersao[] } = {},
) {
  const atualizarRef = useRef(atualizar);
  useEffect(() => { atualizarRef.current = atualizar; }, [atualizar]);

  // Serializada para o efeito não reinstalar o listener a cada render por
  // causa da identidade do array.
  const chaveFontes = opcoes.fontes?.join(",") ?? "";

  useEffect(() => {
    const assinadas = chaveFontes ? chaveFontes.split(",") : [];
    const ouvir = (evento: Event) => {
      const detalhe = (evento as CustomEvent<DetalheAtualizacao>).detail;
      if (detalhe?.tela !== tela) return;
      const alteradas = detalhe.fontes ?? [];
      if (assinadas.length > 0 && alteradas.length > 0
        && !alteradas.some((fonte) => assinadas.includes(fonte))) return;
      atualizarRef.current();
    };
    window.addEventListener(EVENTO_ATUALIZAR_DADOS_LOCAIS, ouvir);
    return () => window.removeEventListener(EVENTO_ATUALIZAR_DADOS_LOCAIS, ouvir);
  }, [tela, chaveFontes]);
}
