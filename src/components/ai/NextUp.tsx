"use client";

import { useState } from "react";
import { ErrorNote, primaryButton } from "./ui";

type Urgency = "now" | "today" | "this_week" | "later";
type Role = "authored_pr" | "review_requested" | "assigned_issue";

type Row = {
  role: Role;
  repo: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  reviewDecision: string | null;
  daysOpen: number;
  daysSinceUpdate: number;
};
type Ranked = Row & { urgency: Urgency; reason: string; nextAction: string };
type Plan = { summary: string; ranking: Ranked[]; unranked: Row[]; truncated: boolean };

const URGENCY: Record<Urgency, [string, string]> = {
  now: ["Now", "bg-red-500/15 text-red-500"],
  today: ["Today", "bg-amber-500/15 text-amber-600"],
  this_week: ["This week", "bg-sky-500/15 text-sky-600"],
  later: ["Later", "bg-zinc-500/15 text-zinc-500"],
};
const ROLE: Record<Role, string> = {
  authored_pr: "Your PR",
  review_requested: "Review requested",
  assigned_issue: "Assigned issue",
};

const ago = (days: number) =>
  days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

export function NextUp() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function rank() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/next", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't rank your work.");
      setPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rank your work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm opacity-70">
          Looks at your open PRs, review requests and assigned issues, then ranks them by urgency
          (stale PRs, people waiting on you, what&apos;s nearly done) and explains why.
        </p>
        <button type="button" onClick={rank} disabled={loading} className={primaryButton}>
          {loading ? "Thinking…" : plan ? "Re-rank" : "What should I work on next?"}
        </button>
      </div>

      {error && <ErrorNote message={error} />}

      {loading && !plan && (
        <div className="flex animate-pulse flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-foreground/10" />
          ))}
        </div>
      )}

      {plan && (
        <div className={`flex flex-col gap-4 ${loading ? "opacity-50" : ""}`}>
          <p className="rounded-xl border bg-foreground/5 p-4 text-sm">{plan.summary}</p>

          <ol className="flex flex-col gap-3">
            {plan.ranking.map((r, i) => (
              <li key={`${r.repo}#${r.number}`} className="flex gap-4 rounded-xl border p-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY[r.urgency][1]}`}
                    >
                      {URGENCY[r.urgency][0]}
                    </span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {r.title}
                    </a>
                  </div>
                  <p className="mt-1 text-xs opacity-60">
                    <span className="font-mono">
                      {r.repo}#{r.number}
                    </span>{" "}
                    · {ROLE[r.role]}
                    {r.draft ? " · draft" : ""} · opened {ago(r.daysOpen)} · updated{" "}
                    {ago(r.daysSinceUpdate)}
                  </p>
                  <p className="mt-2 text-sm">{r.reason}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Next:</span> {r.nextAction}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {plan.unranked.length > 0 && (
            <p className="text-xs opacity-60">
              {plan.unranked.length} item{plan.unranked.length === 1 ? "" : "s"} weren&apos;t
              ranked: {plan.unranked.map((u) => `${u.repo}#${u.number}`).join(", ")}.
            </p>
          )}
          {plan.truncated && (
            <p className="text-xs opacity-60">
              You have more than 25 items in some lists; only the 25 most recently updated of each
              were considered.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
