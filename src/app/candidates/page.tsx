import Link from "next/link";
import { searchCandidates } from "@/lib/queries";
import { Notice, ScoreBadge } from "@/components/ui";

export const instant = false;

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { rows, total } = await searchCandidates(q);
  return (
    <div>
      <h1 className="text-2xl font-bold">Candidates</h1>
      <form method="GET" className="mt-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, title, company, skill or CV ID"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Search</button>
        {q && <Link href="/candidates" className="py-2 text-sm text-indigo-600 hover:underline">Clear</Link>}
      </form>
      <p className="mt-3 text-sm text-slate-500">
        {q ? `${rows.length} result${rows.length === 1 ? "" : "s"} for “${q}”` : `${total} candidates`}
        {rows.length === 200 ? " (showing the first 200)" : ""}
      </p>
      {!rows.length && <div className="mt-4"><Notice kind="info">No candidates match your search.</Notice></div>}
      <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/candidates/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name ?? `Candidate ${c.id}`}</p>
                <p className="truncate text-sm text-slate-600">
                  {c.current_designation ?? "No title"}{c.current_company ? ` · ${c.current_company}` : ""}
                </p>
                <p className="text-xs text-slate-400">CV ID {c.id}{c.total_experience_years != null ? ` · ${c.total_experience_years} yrs` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">best score</p>
                <ScoreBadge score={c.best_score} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}