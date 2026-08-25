import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import { LegalLinks } from "./legal-links";
import { LoginBackground } from "./login-background";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.login.title };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <LoginBackground />
      <div className="relative w-full max-w-md">
        <div className="card-surface relative overflow-hidden px-6 py-9 sm:px-9 sm:py-11">
          <LoginHero />
          <LoginForm />
        </div>
        <LegalLinks />
      </div>
    </main>
  );
}
