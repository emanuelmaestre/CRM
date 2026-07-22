import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { ThemeProvider } from "@/shared/lib/theme-provider";
import appConfig from "@/config/app.json";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: appConfig.fullName, template: appConfig.metadata.titleTemplate },
  description: appConfig.description,
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: appConfig.metadata.appleWebAppTitle },
  other: {
    "tiktok-developers-site-verification": "ptbw0AK1yP4OTOYbtaTkuwMBl3ChdjhS",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0F13" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={appConfig.locale} className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
