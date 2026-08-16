import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  redirect(data?.claims.sub ? "/metricas" : "/auth/login");
}
