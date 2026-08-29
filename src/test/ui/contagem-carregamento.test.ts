import { describe, expect, it } from "vitest";
import {
  casasDe, deslocamentoDaRoda, msPorUnidade, proximoValor,
} from "@/shared/components/atualizacao/contagem";

/** Simula a corrida quadro a quadro, como o requestAnimationFrame faria, e
 *  devolve o inteiro que esteve na tela em cada quadro. */
function correr(
  alvos: Array<{ alvo: number; quadros: number }>,
  msPorQuadro = 16,
  concluindo = false,
): number[] {
  let valor = 0;
  let teto = 0;
  const vistos: number[] = [];
  for (const { alvo, quadros } of alvos) {
    teto = Math.max(teto, alvo); // a trava de monotonicidade do componente
    for (let quadro = 0; quadro < quadros; quadro += 1) {
      valor = proximoValor(valor, teto, msPorQuadro, concluindo);
      vistos.push(Math.floor(valor));
    }
  }
  return vistos;
}

function semRepetir(valores: number[]): number[] {
  return valores.filter((valor, indice) => indice === 0 || valor !== valores[indice - 1]);
}

describe("contagem do carregamento", () => {
  /* A exigência que este arquivo existe para proteger: o número sobe de 1 em
     1, na ordem, sem pular. O servidor manda saltos (0 → 40 → 99 → 100) e é
     a contagem que os transforma em movimento legível. */
  it("passa por todos os inteiros do caminho, sem pular nenhum", () => {
    const vistos = correr([
      { alvo: 0, quadros: 5 },
      { alvo: 40, quadros: 120 },
      { alvo: 99, quadros: 200 },
      { alvo: 100, quadros: 60 },
    ]);
    const sequencia = semRepetir(vistos);

    expect(sequencia[0]).toBe(0);
    expect(sequencia.at(-1)).toBe(100);
    // Cada troca de número anda exatamente uma unidade.
    for (let indice = 1; indice < sequencia.length; indice += 1) {
      expect(sequencia[indice] - sequencia[indice - 1]).toBe(1);
    }
    // E, no fim, todos os 101 números apareceram.
    expect(sequencia).toEqual(Array.from({ length: 101 }, (_, n) => n));
  });

  it("nunca anda para trás quando o servidor reporta um progresso menor", () => {
    const vistos = correr([
      { alvo: 55, quadros: 150 },
      { alvo: 40, quadros: 60 },  // conta nova entrou e diluiu o progresso
      { alvo: 100, quadros: 200 },
    ]);

    for (let indice = 1; indice < vistos.length; indice += 1) {
      expect(vistos[indice]).toBeGreaterThanOrEqual(vistos[indice - 1]);
    }
    expect(vistos.at(-1)).toBe(100);
  });

  it("não ultrapassa o alvo enquanto o servidor não confirma", () => {
    const vistos = correr([{ alvo: 99, quadros: 600 }]);
    expect(Math.max(...vistos)).toBe(99);
  });

  /* Salto grande corre, reta final caminha. Velocidade fixa faria o pulo de
     40 unidades demorar 40 vezes o de 1, e a espera mais longa cairia
     justamente no fim, que é onde ela pesa mais. */
  it("acelera com a distância e desacelera na chegada", () => {
    expect(msPorUnidade(100)).toBeLessThan(msPorUnidade(10));
    expect(msPorUnidade(10)).toBeLessThan(msPorUnidade(2));
    expect(msPorUnidade(80)).toBeGreaterThanOrEqual(14);
    expect(msPorUnidade(1)).toBeLessThanOrEqual(110);
  });

  /* Quando a tela libera, o alvo já é 100 e a contagem está perto dele: a
     corrida de fechamento fecha a diferença dentro do fade, em vez de o
     número sumir no valor em que estava. */
  it("fecha os 100 dentro da saída da cobertura", () => {
    let valor = 85;
    const vistos: number[] = [];
    for (let quadro = 0; quadro < 20; quadro += 1) {  // ~320ms a 60Hz
      valor = proximoValor(valor, 100, 16, true);
      vistos.push(Math.floor(valor));
    }
    expect(Math.floor(valor)).toBe(100);
    // Mesmo correndo, continua sem pular: o fechamento não é exceção à regra.
    for (let indice = 1; indice < vistos.length; indice += 1) {
      expect(vistos[indice] - vistos[indice - 1]).toBeLessThanOrEqual(1);
    }
  });

  /* O teto de uma unidade por quadro precisa valer para o aparelho de 120Hz
     (quadro de 8ms) e para o quadro atrasado que chega com 64ms de uma vez. */
  it.each([8, 16, 33, 64])("não pula número com quadro de %ims", (msPorQuadro) => {
    let valor = 0;
    let anterior = 0;
    for (let quadro = 0; quadro < 400; quadro += 1) {
      valor = proximoValor(valor, 100, msPorQuadro);
      expect(Math.floor(valor) - anterior).toBeLessThanOrEqual(1);
      anterior = Math.floor(valor);
    }
    expect(anterior).toBe(100);
  });
});

describe("odômetro", () => {
  it("a roda das unidades gira o tempo todo", () => {
    expect(deslocamentoDaRoda(4, 0)).toBeCloseTo(4);
    expect(deslocamentoDaRoda(4.5, 0)).toBeCloseTo(4.5);
  });

  /* Sem isto a dezena passaria a corrida inteira parada entre dois
     algarismos, ilegível, enquanto a unidade corre por baixo. */
  it("a dezena fica firme e só acompanha na virada", () => {
    expect(deslocamentoDaRoda(47.3, 1)).toBeCloseTo(4);   // firme no 4
    expect(deslocamentoDaRoda(49.5, 1)).toBeCloseTo(4.5); // virando 4→5
    expect(deslocamentoDaRoda(50, 1)).toBeCloseTo(5);
  });

  it("a virada 9→0 rola para a frente, não rebobina", () => {
    // A tira tem um "0" extra no fim justamente para isto: em 9,9 a roda está
    // quase no décimo primeiro quadro, e não voltando dez casas.
    expect(deslocamentoDaRoda(9.9, 0)).toBeCloseTo(9.9);
    expect(deslocamentoDaRoda(10, 0)).toBeCloseTo(0);
  });

  it("cresce de casas na hora certa", () => {
    expect(casasDe(0)).toBe(1);
    expect(casasDe(9.9)).toBe(1);
    expect(casasDe(10)).toBe(2);
    expect(casasDe(99.9)).toBe(2);
    expect(casasDe(100)).toBe(3);
  });
});
