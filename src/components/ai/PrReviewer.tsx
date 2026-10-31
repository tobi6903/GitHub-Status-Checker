"use client";

import { useId, useState } from "react";
import { Markdown } from "./Markdown";
import { CopyButton, ErrorNote, primaryButton, secondaryButton, StatusLine } from "./ui";
import { useAiStream } from "./useAiStream";

type Meta = {
  title: string;
  url: string;
  author: string | null;
  state: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  omitted: { file: string; reason: string }[];
};

export function PrReviewer() {
  const [pr, setPr] = useState("");
  const { text, status, meta, error, loading, run, stop } = useAiStream<Meta>();
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const inputId = useId();

  const reviewed = Boolean(meta) && Boolean(text) && !loading && !error;

  function review(e: React.FormEvent) {
    e.preventDefault();
    setPosted(null);
    setPostError(null);
    run("/api/ai/review", { pr });
  }

  async function post() {
    if (!meta) return;
    const where = `${new URL(meta.url).pathname.slice(1).replace("/pull/", "#")}`;
    if (
      !window.confirm(
        `Post this review as a comment on ${where}?\n\nIt will appear under your GitHub name.`,
      )
    )
      return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/ai/review/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pr: meta.url, body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't post the comment.");
      setPosted(data.url);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post the comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm opacity-70">
        Paste a pull request. Claude reads the diff and returns a summary, a risk level, the risky
        changes and tests worth writing.
      </p>

      <form onSubmit={review} className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className="sr-only">
          Pull request URL
        </label>
        <input
          id={inputId}
          value={pr}
          onChange={(e) => setPr(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/12  or  owner/repo#12"
          className="min-w-64 flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm"
        />
        {loading ? (
          <button type="button" onClick={stop} className={secondaryButton}>
            Stop
          </button>
        ) : (
          <button className={primaryButton} disabled={pr.trim().length < 3}>
            Review PR
          </button>
        )}
      </form>

      <StatusLine text={status} />
      {error && <ErrorNote message={error} />}

      {meta && (
        <div className="rounded-xl border p-4">
          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {meta.title}
          </a>
          <p className="mt-1 text-xs opacity-60">
            {meta.author ? `by ${meta.author} · ` : ""}
            {meta.draft ? "draft · " : ""}
            {meta.state} · {meta.changedFiles} files ·{" "}
            <span className="text-green-600">+{meta.additions}</span>{" "}
            <span className="text-red-500">-{meta.deletions}</span>
          </p>
          {meta.omitted.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-amber-600">
                {meta.omitted.length} file{meta.omitted.length === 1 ? "" : "s"} not included in the
                review
              </summary>
              <ul className="mt-1 list-disc pl-5 opacity-70">
                {meta.omitted.map((o) => (
                  <li key={o.file}>
                    <span className="font-mono">{o.file}</span>: {o.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {text && (
        <div className="rounded-xl border p-5">
          <Markdown>{text}</Markdown>
        </div>
      )}

      {reviewed && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={text} />
            <button
              type="button"
              onClick={post}
              disabled={posting || Boolean(posted)}
              className={secondaryButton}
            >
              {posting ? "Posting…" : posted ? "Posted ✓" : "Post as PR comment"}
            </button>
            {posted && (
              <a
                href={posted}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sky-600 hover:underline"
              >
                View comment
              </a>
            )}
          </div>
          {postError && <ErrorNote message={postError} />}
          <p className="text-xs opacity-60">
            Posting is the only thing here that writes to GitHub, and only when you press it.
          </p>
        </div>
      )}
    </section>
  );
}
