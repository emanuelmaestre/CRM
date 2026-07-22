import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.login.title };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm relative">
        <LoginHero />
        <LoginForm />
      </div>
    </div>
  );
}
