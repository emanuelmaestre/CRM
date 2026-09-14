/* Cadastro das notas de cada módulo. Uma nota explica o mesmo assunto nos
   três canais lado a lado, porque o operador confere o número do CRM contra
   o painel oficial de cada canal e precisa saber, sem ir e voltar, onde está
   o número aqui, o que ele conta e onde está o equivalente lá.

   Os textos do ⓘ dos cards e o wizard leem das mesmas fontes: uma regra nova
   escrita aqui aparece nos dois lugares, e os dois nunca se contradizem. */

import type { LucideIcon } from "lucide-react";

export type CanalNota = "mercadolivre" | "shopee" | "tiktokshop";

export const CANAIS_NOTA: readonly CanalNota[] = ["mercadolivre", "shopee", "tiktokshop"];

export interface NotaDoCanal {
  /** Caminho no CRM até o número: tela, filtro e card. */
  ondeVer: string;
  /** O que o número conta, em linguagem de operador. */
  significado: string;
  inclui?: string[];
  naoInclui?: string[];
  /** Onde conferir no painel oficial do canal. */
  painelOficial: string;
  /** Se o número deve bater com o painel e, se não, por quê. */
  bateComPainel?: string;
  /** Caminho do painel descrito pela documentação, ainda não visto com a
   *  conta logada. Aparece como selo "a confirmar". */
  aConfirmar?: boolean;
}

export interface NotaNaoSeAplica {
  naoSeAplica: string;
}

export interface ItemLegenda {
  titulo: string;
  cor: string;
  texto: string;
}

export interface AssuntoNota {
  id: string;
  titulo: string;
  /** Grupo do índice, para o operador achar o assunto por tema. */
  grupo: string;
  /** Ilustração do assunto no índice e no cabeçalho do wizard. */
  icone: LucideIcon;
  /** Uma frase: por que este assunto muda de um canal para outro. */
  resumo: string;
  /** Legenda comum aos canais, como os status do pedido. */
  legenda?: ItemLegenda[];
  canais: Record<CanalNota, NotaDoCanal | NotaNaoSeAplica>;
}

export function naoSeAplica(nota: NotaDoCanal | NotaNaoSeAplica): nota is NotaNaoSeAplica {
  return "naoSeAplica" in nota;
}
