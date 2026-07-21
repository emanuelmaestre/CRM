import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Assinatura Sinal Duplo */}
        <div className="mb-8 text-center">
          <div
            className="inline-block text-3xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-sora)" }}
          >
            <span style={{ background: "var(--gradient-signature)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              LEO
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">CRM Plast Leo</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
