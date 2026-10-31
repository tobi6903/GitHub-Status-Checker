"use client";

import { useId, useState } from "react";
import { CopyButton, ErrorNote, primaryButton, secondaryButton, StatusLine } from "./ui";
import { useAiStream } from "./useAiStream";

type Preset = "yesterday" | "lastWorkday" | "24h" | "7d";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "yesterday", label: "Yesterday" },
  { id: "lastWorkday", label: "Last working day" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
];

type Counts = {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issuesOpened: number;
  issuesClosed: number;
  openNow: number;
};

function windowFor(preset: Preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const name = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

  if (preset === "24h")
    return { from: new Date(now.getTime() - 24 * 3600e3), to: now, label: "the last 24 hours" };
  if (preset === "7d")
    return { from: new Date(now.getTime() - 7 * 24 * 3600e3), to: now, label: "the last 7 days" };

  const day = new Date(y, m, d - 1);
  if (preset === "lastWorkday")
    while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 1);
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return {
    from: day,
    to: next,
    label: `${preset === "yesterday" ? "yesterday" : "the last working day"} (${name(day)})`,
  };
}

export function StandupWriter() {
  const [preset, setPreset] = useState<Preset>("lastWorkday");
  const [includeLinks, setIncludeLinks] = useState(true);
  const { text, setText, status, meta, error, loading, run, stop } = useAiStream<Counts>();
  const linksId = useId();

  function generate() {
    const w = windowFor(preset);
    run("/api/ai/standup", {
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      label: w.label,
      includeLinks,
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm opacity-70">
        Writes a Slack-ready standup from your commits, PRs, reviews and issues, plus what&apos;s
        still open for today.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-lg border p-1"
          role="radiogroup"
          aria-label="Period"
        >
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${preset === p.id ? "bg-foreground text-background" : "hover:bg-foreground/5"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label htmlFor={linksId} className="flex items-center gap-2 text-sm">
          <input
            id={linksId}
            type="checkbox"
            checked={includeLinks}
            onChange={(e) => setIncludeLinks(e.target.checked)}
          />
          Include links
        </label>
        <div className="ml-auto flex gap-2">
          {loading && (
            <button type="button" onClick={stop} className={secondaryButton}>
              Stop
            </button>
          )}
          <button type="button" onClick={generate} disabled={loading} className={primaryButton}>
            {text ? "Regenerate" : "Write my standup"}
          </button>
        </div>
      </div>

      <StatusLine text={status} />
      {error && <ErrorNote message={error} />}

      {meta && (
        <p className="text-xs opacity-60">
          Based on {meta.commits} commits, {meta.prsOpened} PRs opened, {meta.prsMerged} merged,{" "}
          {meta.reviews} reviews, {meta.issuesOpened} issues opened, {meta.issuesClosed} closed, and{" "}
          {meta.openNow} items still open.
        </p>
      )}

      {(text || loading) && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={loading}
            rows={14}
            aria-label="Standup draft"
            className="w-full resize-y rounded-xl border bg-transparent p-4 font-mono text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs opacity-60">
              Edit freely before copying. Slack renders *bold* and bullets as typed.
            </p>
            <CopyButton text={text} />
          </div>
        </div>
      )}
    </section>
  );
}
