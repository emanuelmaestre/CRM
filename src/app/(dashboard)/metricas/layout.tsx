import { requirePageRoute } from "@/shared/lib/auth/session";

export default async function MetricasLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/metricas");
  return children;
}
