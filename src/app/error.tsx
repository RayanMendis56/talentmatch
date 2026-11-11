"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm">The data could not be loaded. Check the database connection and try again.</p>
      <p className="mt-1 text-xs opacity-70">{error.message}</p>
      <button onClick={reset} className="mt-3 rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700">
        Try again
      </button>
    </div>
  );
}