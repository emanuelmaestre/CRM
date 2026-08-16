import { redirect } from "next/navigation";

/* O Painel deixou de ser um módulo próprio: seus cards passaram a conviver com
 * os de Métricas num mosaico só (ver metricas/mosaico). A rota continua viva
 * apenas para não quebrar o que já apontava para cá — atalho do app instalado,
 * link salvo, histórico do navegador. */
export default function DashboardPage() {
  redirect("/metricas");
}
