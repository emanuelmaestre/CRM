import permissionsConfig from "@/config/permissions.json";
import { moduloDaRota, type ModuloId } from "@/config/modulos";

export const PERFIS = ["admin", "gestor", "vendedor"] as const;
export type Perfil = (typeof PERFIS)[number];

export function isPerfil(value: unknown): value is Perfil {
  return typeof value === "string" && PERFIS.includes(value as Perfil);
}

export function perfilPodeAcessar(perfil: Perfil, pathname: string): boolean {
  const regra = permissionsConfig.routes.find(({ prefix }) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return !regra || regra.profiles.includes(perfil);
}

export function perfilPermitido(perfil: Perfil, permitidos: readonly Perfil[]): boolean {
  return permitidos.includes(perfil);
}

export function nomePerfil(perfil: Perfil): string {
  return permissionsConfig.profiles[perfil].label;
}

/** Guarda de rota por módulo, complementar à de perfil acima. Perfil decide
 *  o que a pessoa PODE fazer (e hoje todo mundo criado é admin); isto decide
 *  o que ela VÊ — se a rota pertence a um módulo (metricas, vendas, etc.) e
 *  esse módulo não está na lista da pessoa, a página fica fora de alcance
 *  mesmo digitando a URL direto, não só escondida do menu. */
export function moduloPodeAcessar(modulosVisiveis: readonly ModuloId[], pathname: string): boolean {
  const modulo = moduloDaRota(pathname);
  return !modulo || modulosVisiveis.includes(modulo);
}
