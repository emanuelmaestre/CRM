/** A mecânica da contagem do carregamento, separada do componente.
 *
 *  Fica aqui porque a exigência — "passa por todos os números, em ordem, sem
 *  pular" — só é verificável simulando uma corrida inteira quadro a quadro.
 *  Dentro do componente isso dependeria de requestAnimationFrame e viraria
 *  teste de temporizador; aqui é aritmética pura. */

const MS_UNIDADE_MIN = 14;
const MS_UNIDADE_MAX = 110;
const MS_PARA_ATRAVESSAR = 520;

/** Quanto tempo custa cada unidade, dado o que falta.
 *
 *  Proporcional à distância: salto grande corre, os últimos números caminham.
 *  Velocidade fixa faria o pulo de 40 unidades demorar 40 vezes o de 1 — e a
 *  reta final, onde a espera pesa mais, seria a mais lenta de todas. */
export function msPorUnidade(restante: number): number {
  if (restante <= 0) return MS_UNIDADE_MAX;
  return Math.min(MS_UNIDADE_MAX, Math.max(MS_UNIDADE_MIN, MS_PARA_ATRAVESSAR / restante));
}

/** Um quadro de avanço. Nunca ultrapassa o alvo e nunca anda para trás.
 *
 *  O teto de UMA unidade por quadro é o que garante, de fato, que nenhum
 *  inteiro seja pulado — e não o piso de tempo por unidade, que só parece
 *  garantir. Num quadro de 16ms com piso de 14ms o avanço é de 1,14 unidade e
 *  um número some da tela; num monitor de 120Hz o quadro dura 8ms e a conta
 *  muda de novo. O teto vale para qualquer taxa de quadros e para o quadro
 *  atrasado, porque `Math.floor` não consegue andar mais de um degrau quando
 *  o passo é no máximo 1. */
export function proximoValor(
  valor: number,
  alvo: number,
  deltaMs: number,
  concluindo = false,
): number {
  const restante = alvo - valor;
  if (restante <= 0) return valor;
  const ritmo = concluindo ? MS_UNIDADE_MIN : msPorUnidade(restante);
  return Math.min(alvo, valor + Math.min(1, deltaMs / ritmo));
}

/** Onde a roda de uma casa decimal deve parar, em `em`.
 *
 *  Só a roda das unidades (posição 0) gira o tempo todo. As de cima ficam
 *  paradas e só acompanham na virada — é o que um odômetro mecânico faz, e é
 *  o que evita a dezena viver borrada entre dois algarismos enquanto a
 *  unidade corre. */
export function deslocamentoDaRoda(valor: number, posicao: number): number {
  const bruto = valor / 10 ** posicao;
  const base = Math.floor(bruto);
  const fracao = bruto - base;
  const avanco = posicao === 0 ? fracao : Math.min(1, Math.max(0, (fracao - 0.9) * 10));
  return (base % 10) + avanco;
}

/** Quantas casas o número ocupa: 1 até 9, 2 até 99, 3 em 100. */
export function casasDe(valor: number): number {
  return String(Math.max(1, Math.floor(valor))).length;
}
