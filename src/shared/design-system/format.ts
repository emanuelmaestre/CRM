/** Formatadores de número reaproveitados por vários cards de Métricas — cada
 *  um tinha a própria cópia de `Intl.NumberFormat("pt-BR", ...)`, código
 *  idêntico duplicado sem necessidade. `Intl.NumberFormat` é caro de
 *  instanciar; um formatador por processo em vez de um por componente
 *  também evita recriar o objeto a cada render de arquivos que não o
 *  declaravam fora do componente. */
export const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" });
export const inteiro = new Intl.NumberFormat("pt-BR");
