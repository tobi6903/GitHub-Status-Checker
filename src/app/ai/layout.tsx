import Link from "next/link";
import { AiNav } from "@/components/ai/AiNav";

export const metadata = { title: "AI assistant · Git Status" };

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">AI assistant</h1>
          <p className="text-sm opacity-60">
            Claude reads your GitHub data. It never changes anything unless you press a button that
            says so.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-foreground/5"
        >
          ← Dashboard
        </Link>
      </header>
      <AiNav />
      {children}
    </main>
  );
}
