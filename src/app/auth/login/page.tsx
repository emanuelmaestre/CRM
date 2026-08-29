import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import { LegalLinks } from "./legal-links";
import { LoginBackground } from "./login-background";
import pagesConfig from "@/config/pages.json";
import { destinoSeguroPosLogin } from "@/shared/lib/auth/destino-pos-login";

export const metadata = { title: pagesConfig.login.title };

/* O destino é resolvido aqui, no servidor, em vez de por useSearchParams
   dentro do formulário: o formulário é cliente e a leitura do parâmetro ali
   exigiria um Suspense em volta da tela de login inteira. */
export default async function LoginPage(
  { searchParams }: { searchParams: Promise<{ next?: string }> },
) {
  const { next } = await searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <LoginBackground />
      <div className="relative w-full max-w-md">
        <div className="relative overflow-hidden px-6 py-9 sm:px-9 sm:py-11">
          <LoginHero />
          <LoginForm destino={destinoSeguroPosLogin(next)} />
        </div>
        <LegalLinks />
      </div>
    </main>
  );
}
