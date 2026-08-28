import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { I18nProvider } from "./components/I18nProvider";
import AppShell from "./components/AppShell";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RVC Ledger",
  description: "Upload bills and track customer dues",
  manifest: "/manifest.json",
  themeColor: "#8b2e2e",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RVC Ledger",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
        <ClerkProvider afterSignOutUrl="/sign-in">
          <ThemeProvider>
            <I18nProvider>
              <AppShell>{children}</AppShell>
              <ServiceWorkerRegister />
            </I18nProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
