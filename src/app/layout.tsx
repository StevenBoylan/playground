import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The header carries the stevenboylan.eu look: Montserrat, black and the site's green.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "800"],
});

const SITE = "https://stevenboylan.eu";

export const metadata: Metadata = {
  title: "Playground",
  description: "Open-source concept demos by Steven Boylan.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="app-bg flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-md">
          <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
            <Link
              href="/"
              aria-label="playground.stevenboylan, home"
              className="focus-ring flex items-center gap-3 rounded-lg font-[family-name:var(--font-montserrat)] font-extrabold leading-none"
            >
              <span aria-hidden="true" className="text-xl tracking-tight text-ink">
                <span className="text-[#00d285]">_</span>p.<span className="text-[#00d285]">SB</span>
              </span>
              <span className="hidden text-base tracking-tight text-ink sm:inline">
                playground.steven<span className="text-[#00d285]">boylan</span>
              </span>
            </Link>
            <div className="flex items-center gap-1 font-[family-name:var(--font-montserrat)] text-sm font-medium sm:gap-3">
              <a href={SITE} className="focus-ring rounded-lg px-2 py-1 text-muted transition-colors hover:text-ink">
                Back to home
              </a>
              <a href={`${SITE}/contact-me/`} className="focus-ring rounded-lg px-2 py-1 text-muted transition-colors hover:text-ink">
                Contact me
              </a>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line py-6 text-center text-xs text-muted">
          All companies and data in these demos are fictional.{" "}
          <a href="https://github.com/StevenBoylan/playground" className="focus-ring rounded underline underline-offset-2 hover:text-ink">
            Open source on GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
