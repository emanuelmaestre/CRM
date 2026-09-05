"use client";

import { createContext, useContext } from "react";
import type {
  actionListarConfiguracaoCanais,
  actionListarRotinasAgendadas,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
} from "./actions";

export type ConfiguracoesIniciais = {
  usuarios: Awaited<ReturnType<typeof actionListarUsuarios>> | null;
  canais: Awaited<ReturnType<typeof actionListarConfiguracaoCanais>> | null;
  resumo: Awaited<ReturnType<typeof actionObterResumoConfiguracoes>> | null;
  rotinas: Awaited<ReturnType<typeof actionListarRotinasAgendadas>> | null;
};

const Contexto = createContext<ConfiguracoesIniciais | null>(null);

export function ConfiguracoesIniciaisProvider({
  value,
  children,
}: {
  value: ConfiguracoesIniciais;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={value}>{children}</Contexto.Provider>;
}

export function useConfiguracoesIniciais(): ConfiguracoesIniciais {
  return useContext(Contexto) ?? {
    usuarios: null,
    canais: null,
    resumo: null,
    rotinas: null,
  };
}
