import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { GithubIcon } from "@/components/shared/icons";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Playground",
  description: "Open-source concept demos by Steven Boylan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="app-bg flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-md">
          <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
            <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-lg font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ background: "linear-gradient(135deg, #2563eb, #8b5cf6)" }}
              >
                P
              </span>
              Playground
            </Link>
            <a
              href="https://github.com/StevenBoylan/playground"
              className="focus-ring flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-ink"
            >
              <GithubIcon width={18} height={18} />
              <span className="hidden sm:inline">Open source</span>
            </a>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line py-6 text-center text-xs text-muted">
          All companies and data in these demos are fictional.
        </footer>
      </body>
    </html>
  );
}
