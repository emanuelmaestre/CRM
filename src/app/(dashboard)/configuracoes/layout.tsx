import { requirePageRoute } from "@/shared/lib/auth/session";
import {
  actionListarConfiguracaoCanais,
  actionListarRotinasAgendadas,
  actionListarUsuarios,
  actionObterResumoConfiguracoes,
  actionObterUsoApiShopee,
} from "./actions";
import { ConfiguracoesIniciaisProvider } from "./configuracoes-iniciais";

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requirePageRoute("/configuracoes");
  const [usuarios, canais, resumo, rotinas, usoShopee] = await Promise.all([
    actionListarUsuarios().catch(() => null),
    actionListarConfiguracaoCanais().catch(() => null),
    actionObterResumoConfiguracoes().catch(() => null),
    actionListarRotinasAgendadas().catch(() => null),
    actionObterUsoApiShopee().catch(() => null),
  ]);

  return (
    <ConfiguracoesIniciaisProvider value={{ usuarios, canais, resumo, rotinas, usoShopee }}>
      {children}
    </ConfiguracoesIniciaisProvider>
  );
}
