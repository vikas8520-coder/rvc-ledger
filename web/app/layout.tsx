import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { I18nProvider } from "./components/I18nProvider";
import { ToastProvider } from "./components/ui";
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

// Check if Clerk is configured (has real publishable key)
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
  const content = (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AppShell>{children}</AppShell>
          <ServiceWorkerRegister />
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
        {isClerkConfigured ? (
          <ClerkProvider afterSignOutUrl="/sign-in">{content}</ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
