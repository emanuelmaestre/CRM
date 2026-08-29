/** Para onde mandar a pessoa depois do login.
 *
 *  O proxy escreve `?next=` ao barrar uma rota protegida. Duas coisas
 *  precisam ser verdade sobre esse valor:
 *
 *  1. Ele volta como veio, com a query junto. Um link como
 *     `/estoque?filtro=parados` (o "ver todos" dos cards de Métricas) perdia
 *     o recorte no caminho e a pessoa caía na lista completa, tendo que
 *     reencontrar o filtro no braço.
 *  2. Ele nunca pode virar um endereço de fora. `next` chega pela URL, ou
 *     seja, de quem quiser montar o link — sem esta trava, um
 *     `?next=https://outro-site` transformaria a nossa tela de login em
 *     trampolim para a página que o atacante quisesse, logo depois de a
 *     pessoa digitar a senha.
 *
 *  Só passa caminho interno absoluto. `//host` e `/\host` são recusados de
 *  propósito: o navegador lê os dois como "outro servidor". */
export const DESTINO_PADRAO_POS_LOGIN = "/metricas";

export function destinoSeguroPosLogin(valor: string | null | undefined): string {
  if (typeof valor !== "string" || valor.length === 0) return DESTINO_PADRAO_POS_LOGIN;
  if (!valor.startsWith("/")) return DESTINO_PADRAO_POS_LOGIN;
  if (valor.startsWith("//") || valor.startsWith("/\\")) return DESTINO_PADRAO_POS_LOGIN;
  // Controle e espaço em branco no meio só aparecem em tentativa de burlar a
  // leitura acima (ex.: "/\tjavascript:").
  if (/[\u0000-\u001f\u007f]/.test(valor)) return DESTINO_PADRAO_POS_LOGIN;
  // Voltar para o próprio login faria a pessoa logar e cair na tela de login.
  if (valor === "/auth/login" || valor.startsWith("/auth/login?")) return DESTINO_PADRAO_POS_LOGIN;
  return valor;
}
