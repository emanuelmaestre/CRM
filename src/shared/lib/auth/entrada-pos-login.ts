"use client";

/** A primeira tela depois do login não passa pelo portão de confirmação.
 *
 *  O portão cobre a tela com o contador enquanto confirma os canais. Fazer
 *  isso no instante seguinte ao da senha é o pior momento possível: a pessoa
 *  acabou de agir, e a resposta ao ato dela é uma espera em tela cheia que
 *  ela lê como "o login travou" — não como "estou conferindo os canais". Era
 *  a queixa: o carregamento parecia ser do login.
 *
 *  A confirmação continua acontecendo, no mesmo instante e do mesmo jeito.
 *  Ela só deixa de ser pedágio: quando termina, a tela se atualiza sozinha;
 *  quando falha, aparece a tarja com a hora do dado. Nas outras entradas — um
 *  atalho direto para /metricas, um F5 — o portão continua igual.
 *
 *  Estado de módulo, não sessionStorage: o valor só precisa atravessar UMA
 *  navegação de cliente (`router.replace` do formulário), e nessa navegação o
 *  contexto de JavaScript é o mesmo. Storage traria de volta o problema de
 *  hidratação — o servidor renderiza sem enxergar o valor e o cliente
 *  hidrataria com ele — em troca de nada. Se algum dia a navegação virar
 *  recarga de documento, a marca se perde e o portão simplesmente aparece,
 *  que é o comportamento antigo. */
let veioDoLogin = false;

/** Chamado pelo formulário, no clique que deu certo, imediatamente antes de
 *  navegar. */
export function marcarEntradaPosLogin(): void {
  veioDoLogin = true;
}

/** Leitura pura: pode ser chamada no inicializador de `useState` sem medo do
 *  Strict Mode, que invoca o inicializador duas vezes. Quem limpa é
 *  `limparEntradaPosLogin`, num efeito de montagem. */
export function entradaVeioDoLogin(): boolean {
  return veioDoLogin;
}

/** Vale para a primeira montagem do painel e só para ela. */
export function limparEntradaPosLogin(): void {
  veioDoLogin = false;
}
