import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/shared/lib/theme-provider";
import { MotionProvider } from "@/shared/providers/motion-provider";
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
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: appConfig.viewport.lightThemeColor },
    { media: "(prefers-color-scheme: dark)", color: appConfig.viewport.darkThemeColor },
  ],
  width: appConfig.viewport.width,
  initialScale: appConfig.viewport.initialScale,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={appConfig.locale} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MotionProvider>
            {children}
            <Toaster richColors position="top-right" />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
