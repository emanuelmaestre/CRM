/**
 * Mede quanto a marca líder está à frente da segunda colocada no recorte
 * atual. É uma diferença entre marcas, não uma variação no tempo.
 *
 * Sem duas marcas ou sem uma base positiva na segunda colocada, não existe
 * denominador honesto para exibir um percentual.
 */
export function calcularVantagemPercentualDaLider(
  faturamentos: readonly number[],
): number | null {
  if (faturamentos.length < 2) return null;

  const [lider, segunda] = [...faturamentos].sort((a, b) => b - a);
  if (!Number.isFinite(lider) || !Number.isFinite(segunda) || segunda <= 0) return null;

  return Math.round(((lider - segunda) / segunda) * 100);
}

export type CriterioComparacao = "ticketMedio" | "cancelamento" | "recorrencia";
type MarcaComparavel = {
  marcaLabel: string; ticketMedio: number;
  pedidos?: number;
  taxaCancelamento: number | null; taxaRecorrencia: number | null;
};
export const CRITERIO_MENOR_VENCE: Partial<Record<CriterioComparacao, true>> = { cancelamento: true };

export function valorComparacao(marca: MarcaComparavel, criterio: CriterioComparacao): number | null {
  return criterio === "ticketMedio" ? (marca.pedidos === 0 ? null : marca.ticketMedio)
    : criterio === "cancelamento" ? marca.taxaCancelamento : marca.taxaRecorrencia;
}

export function ordenarComparacao<T extends MarcaComparavel>(marcas: readonly T[], criterio: CriterioComparacao): T[] {
  return [...marcas].sort((a, b) => {
    const va = valorComparacao(a, criterio);
    const vb = valorComparacao(b, criterio);
    if (va === null && vb === null) return a.marcaLabel.localeCompare(b.marcaLabel);
    if (va === null) return 1;
    if (vb === null) return -1;
    return (CRITERIO_MENOR_VENCE[criterio] ? va - vb : vb - va) || a.marcaLabel.localeCompare(b.marcaLabel);
  });
}

export function vantagemComparacao(marcas: readonly MarcaComparavel[], criterio: CriterioComparacao): number | null {
  const medidas = ordenarComparacao(marcas, criterio).filter((m) => valorComparacao(m, criterio) !== null);
  if (medidas.length < 2) return null;
  const lider = valorComparacao(medidas[0], criterio)!;
  const segunda = valorComparacao(medidas[1], criterio)!;
  if (segunda <= 0) return lider === segunda ? 0 : null;
  return Math.round((CRITERIO_MENOR_VENCE[criterio] ? segunda - lider : lider - segunda) / segunda * 100);
}
