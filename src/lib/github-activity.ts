import "server-only";
import { graphql } from "@octokit/graphql";
import { toItem, mapGraphqlError, type Item } from "./github";
import { ACTIVITY_QUERY } from "./github-queries";
import { gh } from "./github-rest";

type Ref = { repo: string; number: number; title: string; url: string };

export type Activity = {
  window: { from: string; to: string };
  commits: { repo: string; count: number; messages: string[] }[];
  pullRequestsOpened: Ref[];
  pullRequestsMerged: Ref[];
  reviews: (Ref & { verdict: string })[];
  issuesOpened: Ref[];
  issuesClosed: Ref[];
};

const ref = (i: Item): Ref => ({ repo: i.repo, number: i.number, title: i.title, url: i.url });
// GitHub search wants whole-second timestamps.
const stamp = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

/* eslint-disable @typescript-eslint/no-explicit-any -- raw GraphQL payload */
// What `login` did between `from` and `to` (ISO timestamps, at most a year apart).
export async function fetchActivity(
  token: string,
  login: string,
  from: string,
  to: string,
): Promise<Activity> {
  const f = stamp(from);
  const t = stamp(to);

  let data: any;
  try {
    data = await graphql<any>(ACTIVITY_QUERY, {
      from: f,
      to: t,
      merged: `is:pr is:merged author:${login} merged:${f}..${t} archived:false`,
      closed: `is:issue is:closed author:${login} closed:${f}..${t} archived:false`,
      headers: { authorization: `bearer ${token}` },
    });
  } catch (err) {
    throw mapGraphqlError(err);
  }

  const c = data.viewer.contributionsCollection;
  const nodes = (conn: any, pick: (n: any) => any): any[] =>
    (conn.nodes as any[]).map(pick).filter(Boolean);

  const byRepo = (c.commitContributionsByRepository as any[])
    .map((r) => ({
      repo: r.repository.nameWithOwner as string,
      count: (r.contributions.nodes as { commitCount: number }[]).reduce(
        (n, x) => n + x.commitCount,
        0,
      ),
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  // Contributions only carry commit counts; fetch the actual messages for the busiest repos.
  const withMessages = await Promise.all(
    byRepo.slice(0, 8).map(async (r) => {
      try {
        const res = await gh(
          token,
          `/repos/${r.repo}/commits?author=${encodeURIComponent(login)}&since=${f}&until=${t}&per_page=30`,
        );
        const commits = (await res.json()) as { commit: { message: string } }[];
        return { ...r, messages: commits.map((x) => x.commit.message.split("\n")[0]) };
      } catch {
        return { ...r, messages: [] }; // repo not visible to this token: keep the count only
      }
    }),
  );

  const items = (conn: any) => nodes(conn, (n) => toItem(n)).filter((i): i is Item => i !== null);

  return {
    window: { from: f, to: t },
    commits: [...withMessages, ...byRepo.slice(8).map((r) => ({ ...r, messages: [] }))],
    pullRequestsOpened: items({
      nodes: nodes(c.pullRequestContributions, (n) => n.pullRequest),
    }).map(ref),
    pullRequestsMerged: items(data.merged).map(ref),
    reviews: nodes(c.pullRequestReviewContributions, (n) => n.pullRequestReview).map((r) => ({
      repo: r.pullRequest.repository.nameWithOwner,
      number: r.pullRequest.number,
      title: r.pullRequest.title,
      url: r.pullRequest.url,
      verdict: String(r.state).toLowerCase().replace("_", " "),
    })),
    issuesOpened: items({ nodes: nodes(c.issueContributions, (n) => n.issue) }).map(ref),
    issuesClosed: items(data.closed).map(ref),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
