import "server-only";

const API = "https://api.github.com";

export class GitHubHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gh(
  token: string,
  path: string,
  init: RequestInit & { accept?: string } = {},
): Promise<Response> {
  const { accept, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      accept: accept ?? "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "git-status",
      ...rest.headers,
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new GitHubHttpError(res.status, payload?.message ?? res.statusText);
  }
  return res;
}

export type PrRef = { owner: string; repo: string; number: number };

// Accepts a PR URL, owner/repo#12 or owner/repo/pull/12.
export function parsePrRef(input: string): PrRef | null {
  const m = input
    .trim()
    .match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/pull\/|#)(\d+)(?:[/?#].*)?$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

export type PullRequest = {
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  user: { login: string; type: string } | null;
  head: { sha: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
};

export async function getPullRequest(token: string, r: PrRef): Promise<PullRequest> {
  return (await gh(token, `/repos/${r.owner}/${r.repo}/pulls/${r.number}`)).json();
}

export async function getPullDiff(token: string, r: PrRef): Promise<string> {
  const res = await gh(token, `/repos/${r.owner}/${r.repo}/pulls/${r.number}`, {
    accept: "application/vnd.github.diff",
  });
  return res.text();
}

export async function postIssueComment(token: string, r: PrRef, body: string) {
  const res = await gh(token, `/repos/${r.owner}/${r.repo}/issues/${r.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
    headers: { "content-type": "application/json" },
  });
  return (await res.json()) as { html_url: string };
}
