// Aliases preservam o contrato existente do Mercado Livre. Cálculos comuns
// vivem no domínio de canais; somente a adaptação de calendário é específica.
export {
  consolidarDesempenho as consolidarDesempenhoML,
  periodoAnteriorDesempenho as periodoAnteriorML,
  variacaoDesempenho as variacaoDesempenhoML,
  type BaseDesempenhoCanal as BaseDesempenhoML,
  type IndicadoresDesempenhoCanal as IndicadoresDesempenhoML,
  type DesempenhoCanal as DesempenhoMercadoLivre,
} from "./desempenho-canal";

/** A API de visitas aceita apenas datas e retorna dias UTC-4 (validado em
 * 30/08/2026). Os cards usam esse calendário; a conferência permanece UTC-3. */
export function periodoDesempenhoML(inicio: Date, fim: Date) {
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const dataInicio = data.format(inicio);
  const dataFim = data.format(fim);
  return { dataInicio, dataFim, inicio: new Date(`${dataInicio}T00:00:00-04:00`), fim: new Date(`${dataFim}T23:59:59.999-04:00`) };
}
