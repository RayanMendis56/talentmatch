import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentMatch",
  description: "AI-ranked candidates for every job",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/jobs" className="text-lg font-bold text-indigo-700">TalentMatch</Link>
            <nav className="flex gap-5 text-sm font-medium">
              <Link href="/jobs" className="hover:text-indigo-600">Jobs</Link>
              <Link href="/candidates" className="hover:text-indigo-600">Candidates</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}