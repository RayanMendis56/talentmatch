import Link from "next/link";

export function ScoreBadge({ score, big = false }: { score: number | null; big?: boolean }) {
  if (score == null) return <span className="text-sm text-slate-400">–</span>;
  const tone =
    score >= 70 ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
    : score >= 40 ? "bg-amber-100 text-amber-800 ring-amber-200"
    : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${tone} ${big ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-sm"}`}>
      {score.toFixed(1)}
    </span>
  );
}

export function FactorBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded bg-slate-200">
        <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Chips({ items, tone }: { items: string[]; tone: "good" | "bad" | "neutral" }) {
  const cls =
    tone === "good" ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : tone === "bad" ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
  if (!items.length) return <span className="text-xs text-slate-400">none</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className={`rounded px-1.5 py-0.5 text-xs ring-1 ${cls}`}>{s}</span>
      ))}
    </span>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info"; children: React.ReactNode }) {
  const cls = kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-800";
  return <div className={`rounded-lg border p-4 text-sm ${cls}`}>{children}</div>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-sm text-indigo-600 hover:underline">← {children}</Link>;
}