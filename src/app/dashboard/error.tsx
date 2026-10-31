"use client";

export default function DashboardError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto max-w-md p-12 text-center">
      <h1 className="text-xl font-semibold">Couldn&apos;t load your GitHub data</h1>
      <p className="mt-2 text-sm opacity-70">{error.message}</p>
      <button
        onClick={() => retry()}
        className="mt-6 rounded-lg border px-4 py-2 text-sm hover:bg-foreground/5"
      >
        Try again
      </button>
    </main>
  );
}
