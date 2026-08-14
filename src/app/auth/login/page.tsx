import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.login.title };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="w-full max-w-sm relative">
        <LoginHero />
        <LoginForm />
      </div>
    </main>
  );
}
