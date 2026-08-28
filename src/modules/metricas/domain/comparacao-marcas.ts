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
