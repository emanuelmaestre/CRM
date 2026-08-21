import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/shared/providers/motion-provider";
import { ServiceWorkerRegister } from "@/shared/providers/service-worker-register";
import appConfig from "@/config/app.json";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: appConfig.fullName, template: appConfig.metadata.titleTemplate },
  description: appConfig.description,
  manifest: appConfig.metadata.manifest,
  appleWebApp: {
    capable: true,
    statusBarStyle: appConfig.metadata.appleWebAppStatusBarStyle as "default" | "black" | "black-translucent",
    title: appConfig.metadata.appleWebAppTitle,
  },
  other: {
    "tiktok-developers-site-verification": appConfig.metadata.tiktokDevelopersSiteVerification,
    // Sem isso, iOS/Android detectam sequências como "R$ 0,00" como se fossem
    // telefone e as transformam em link azul sublinhado — visível em qualquer
    // valor monetário da tela, não só neste card.
    "format-detection": "telephone=no, date=no, email=no, address=no",
  },
};

export const viewport: Viewport = {
  themeColor: appConfig.viewport.themeColor,
  width: appConfig.viewport.width,
  initialScale: appConfig.viewport.initialScale,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={appConfig.locale}>
      <body className="font-sans antialiased">
        <MotionProvider>
          <ServiceWorkerRegister />
          {children}
          <Toaster
            richColors
            position="top-right"
            mobileOffset={{ top: "max(1rem, env(safe-area-inset-top))", left: "1rem", right: "1rem" }}
          />
        </MotionProvider>
      </body>
    </html>
  );
}
