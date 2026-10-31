import "server-only";
import { z } from "zod";
import { searchItems, type Item } from "@/lib/github";
import { fetchActivity } from "@/lib/github-activity";
import { gh } from "@/lib/github-rest";
import { fetchWorkQueue, toPromptItem } from "./work-queue";

export type ToolContext = { token: string; login: string };

const SPECS = [
  {
    name: "search_issues_and_prs",
    description:
      "Search GitHub issues and pull requests across all repositories the user can access, using GitHub search syntax. " +
      "Use qualifiers such as is:pr, is:issue, is:open, is:closed, is:merged, is:draft, author:, assignee:, review-requested:, reviewed-by:, involves:, repo:owner/name, label:, created:>2026-01-01, updated:<2026-09-01, merged:>=2026-10-01, sort:updated-asc. " +
      "Use @me for the signed-in user. Returns the total match count and up to `limit` items.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "GitHub search query, e.g. 'is:pr is:open author:@me sort:updated-asc'",
        },
        limit: { type: "integer", description: "Max items to return (default 15, max 30)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_item_details",
    description:
      "Get one issue or pull request in detail: description, labels, assignees, recent comments and, for PRs, review states, requested reviewers, size and merge state.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "owner/name" },
        number: { type: "integer" },
      },
      required: ["repo", "number"],
    },
  },
  {
    name: "get_activity",
    description:
      "What the signed-in user did in a time window: commits (with messages), PRs opened and merged, reviews given, issues opened and closed. Window is at most 31 days.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date or datetime, inclusive, e.g. 2026-10-24" },
        to: { type: "string", description: "ISO date or datetime, exclusive, e.g. 2026-10-31" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_work_queue",
    description:
      "Everything currently waiting on the signed-in user: their open PRs, PRs awaiting their review, and issues assigned to them, with age and staleness in days.",
    parameters: { type: "object", properties: {} },
  },
];

// OpenAI-style function definitions; LangChain converts them for Anthropic too.
export const TOOL_DEFS = SPECS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

const Search = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(30).default(15),
});
const Details = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  number: z.number().int().positive(),
});
const Window = z.object({ from: z.string().min(8), to: z.string().min(8) });

const MAX_RESULT_CHARS = 30_000;

const compact = (i: Item) => ({
  kind: i.kind,
  repo: i.repo,
  number: i.number,
  title: i.title,
  url: i.url,
  state: i.state,
  draft: i.isDraft || undefined,
  reviewDecision: i.reviewDecision ?? undefined,
  author: i.author,
  created: i.createdAt,
  updated: i.updatedAt,
  closed: i.closedAt ?? undefined,
  merged: i.mergedAt ?? undefined,
  comments: i.comments,
  labels: i.labels.map((l) => l.name),
});

/* eslint-disable @typescript-eslint/no-explicit-any -- raw GitHub REST payloads */
async function details(token: string, repo: string, number: number) {
  const issue = await (await gh(token, `/repos/${repo}/issues/${number}`)).json();
  const isPr = Boolean(issue.pull_request);
  const [comments, pr, reviews] = await Promise.all([
    gh(token, `/repos/${repo}/issues/${number}/comments?per_page=15`).then((r) => r.json()),
    isPr ? gh(token, `/repos/${repo}/pulls/${number}`).then((r) => r.json()) : null,
    isPr
      ? gh(token, `/repos/${repo}/pulls/${number}/reviews?per_page=30`).then((r) => r.json())
      : null,
  ]);
  return {
    kind: isPr ? "pr" : "issue",
    repo,
    number,
    title: issue.title,
    url: issue.html_url,
    state: pr?.merged ? "merged" : issue.state,
    author: issue.user?.login,
    created: issue.created_at,
    updated: issue.updated_at,
    labels: issue.labels.map((l: any) => l.name),
    assignees: issue.assignees.map((a: any) => a.login),
    body: (issue.body ?? "").slice(0, 3000),
    comments: (comments as any[]).map((c) => ({
      by: c.user?.login,
      at: c.created_at,
      body: (c.body ?? "").slice(0, 600),
    })),
    ...(pr && {
      draft: pr.draft,
      mergeableState: pr.mergeable_state,
      size: { additions: pr.additions, deletions: pr.deletions, files: pr.changed_files },
      requestedReviewers: pr.requested_reviewers.map((r: any) => r.login),
      reviews: (reviews as any[]).map((r) => ({
        by: r.user?.login,
        state: r.state,
        at: r.submitted_at,
      })),
    }),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DAY = 24 * 3600 * 1000;
const toIso = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a valid date: ${s}`);
  return d.toISOString();
};

// Shown in the chat while a tool runs.
export function describeCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_issues_and_prs":
      return `Searching GitHub: ${String(i.query ?? "")}`;
    case "get_item_details":
      return `Reading ${String(i.repo ?? "")}#${String(i.number ?? "")}`;
    case "get_activity":
      return `Looking at your activity ${String(i.from ?? "")} to ${String(i.to ?? "")}`;
    case "get_work_queue":
      return "Checking what's waiting on you";
    default:
      return name;
  }
}

// Runs a tool. Never throws: failures go back to the model as { error }.
export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<{ text: string; isError: boolean }> {
  try {
    let result: unknown;
    switch (name) {
      case "search_issues_and_prs": {
        const a = Search.parse(input);
        const found = await searchItems(ctx.token, a.query.replaceAll("@me", ctx.login), a.limit);
        result = {
          totalMatches: found.total,
          shown: found.items.length,
          items: found.items.map(compact),
        };
        break;
      }
      case "get_item_details": {
        const a = Details.parse(input);
        result = await details(ctx.token, a.repo, a.number);
        break;
      }
      case "get_activity": {
        const a = Window.parse(input);
        const from = toIso(a.from);
        const to = toIso(a.to);
        if (new Date(to) <= new Date(from)) throw new Error("`to` must be after `from`");
        if (new Date(to).getTime() - new Date(from).getTime() > 31 * DAY)
          throw new Error("Window is longer than 31 days");
        result = await fetchActivity(ctx.token, ctx.login, from, to);
        break;
      }
      case "get_work_queue": {
        const q = await fetchWorkQueue(ctx.token, ctx.login);
        result = { truncated: q.truncated, items: q.items.map(toPromptItem) };
        break;
      }
      default:
        return { text: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
    }
    let text = JSON.stringify(result);
    if (text.length > MAX_RESULT_CHARS) {
      text = JSON.stringify({
        error: "Result too large; narrow the query or lower the limit.",
        sizeChars: text.length,
      });
      return { text, isError: true };
    }
    return { text, isError: false };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? `Invalid input: ${z.prettifyError(err)}`
        : err instanceof Error
          ? err.message
          : "Tool failed";
    return { text: JSON.stringify({ error: message }), isError: true };
  }
}
