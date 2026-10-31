import "server-only";
import { graphql, GraphqlResponseError } from "@octokit/graphql";
import { ITEM_FIELDS, SEARCH_QUERY } from "./github-queries";

export type Label = { name: string; color: string };

export type Item = {
  kind: "pr" | "issue";
  id: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  repo: string; // owner/name
  author: string | null;
  comments: number;
  labels: Label[];
};

export type ContributionDay = { date: string; count: number; color: string };

export type Dashboard = {
  // when the data was fetched; used as "now" for relative times
  fetchedAt: number;
  profile: {
    login: string;
    name: string | null;
    avatarUrl: string;
    url: string;
    bio: string | null;
    followers: number;
    following: number;
    publicRepos: number;
  };
  stats: {
    commits: number;
    pullRequests: number;
    issues: number;
    reviews: number;
    total: number;
  };
  calendar: ContributionDay[][];
  openPRs: Section;
  reviewRequests: Section;
  issuesRaised: Section;
  issuesAssigned: Section;
  mergedPRs: Section;
  closedIssues: Section;
};

// total is GitHub's full count; items is capped at PAGE_SIZE
export type Section = { total: number; items: Item[] };

const PAGE_SIZE = 50;

const section = (alias: string) => /* GraphQL */ `
  ${alias}: search(query: $${alias}, type: ISSUE, first: ${PAGE_SIZE}) {
    issueCount
    nodes { ...ItemFields ...PRFields }
  }
`;

const SECTIONS = [
  "openPRs",
  "reviewRequests",
  "issuesRaised",
  "issuesAssigned",
  "mergedPRs",
  "closedIssues",
] as const;

const QUERY = /* GraphQL */ `
  ${ITEM_FIELDS}
  query Dashboard(${SECTIONS.map((s) => `$${s}: String!`).join(", ")}) {
    viewer {
      login name avatarUrl url bio
      followers { totalCount }
      following { totalCount }
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount color } }
        }
      }
    }
    ${SECTIONS.map(section).join("\n")}
  }
`;

/* eslint-disable @typescript-eslint/no-explicit-any -- raw GraphQL payload, mapped to typed shapes below */
type GraphqlData = any;

export function toItem(node: any): Item | null {
  // A search node can be empty if a fragment type didn't match (e.g. a Discussion).
  if (!node?.id) return null;
  const isPR = node.__typename === "PullRequest";
  return {
    kind: isPR ? "pr" : "issue",
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    state: isPR ? node.prState : node.issueState,
    isDraft: isPR ? node.isDraft : false,
    reviewDecision: isPR ? node.reviewDecision : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt,
    mergedAt: isPR ? node.mergedAt : null,
    repo: node.repository.nameWithOwner,
    author: node.author?.login ?? null,
    comments: node.comments.totalCount,
    labels: node.labels.nodes.filter(Boolean),
  };
}

export function toSection(search: any): Section {
  return {
    total: search.issueCount,
    items: search.nodes.map(toItem).filter((i: Item | null): i is Item => i !== null),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class GitHubAuthError extends Error {}

export async function fetchDashboard(accessToken: string, login: string): Promise<Dashboard> {
  const q = (rest: string) => `${rest} archived:false sort:updated-desc`;
  const variables = {
    openPRs: q(`is:pr is:open author:${login}`),
    reviewRequests: q(`is:pr is:open review-requested:${login}`),
    issuesRaised: q(`is:issue is:open author:${login}`),
    issuesAssigned: q(`is:issue is:open assignee:${login}`),
    mergedPRs: q(`is:pr is:merged author:${login}`),
    closedIssues: q(`is:issue is:closed author:${login}`),
  };

  try {
    const data = await graphql<GraphqlData>(QUERY, {
      ...variables,
      headers: { authorization: `bearer ${accessToken}` },
    });
    const v = data.viewer;
    const c = v.contributionsCollection;
    return {
      fetchedAt: Date.now(),
      profile: {
        login: v.login,
        name: v.name,
        avatarUrl: v.avatarUrl,
        url: v.url,
        bio: v.bio,
        followers: v.followers.totalCount,
        following: v.following.totalCount,
        publicRepos: v.repositories.totalCount,
      },
      stats: {
        commits: c.totalCommitContributions,
        pullRequests: c.totalPullRequestContributions,
        issues: c.totalIssueContributions,
        reviews: c.totalPullRequestReviewContributions,
        total: c.contributionCalendar.totalContributions,
      },
      calendar: c.contributionCalendar.weeks.map(
        (w: { contributionDays: { date: string; contributionCount: number; color: string }[] }) =>
          w.contributionDays.map((d) => ({
            date: d.date,
            count: d.contributionCount,
            color: d.color,
          })),
      ),
      openPRs: toSection(data.openPRs),
      reviewRequests: toSection(data.reviewRequests),
      issuesRaised: toSection(data.issuesRaised),
      issuesAssigned: toSection(data.issuesAssigned),
      mergedPRs: toSection(data.mergedPRs),
      closedIssues: toSection(data.closedIssues),
    };
  } catch (err) {
    throw mapGraphqlError(err);
  }
}

// Runs one GitHub search query and returns typed items.
export async function searchItems(accessToken: string, q: string, first = 20): Promise<Section> {
  try {
    const data = await graphql<GraphqlData>(SEARCH_QUERY, {
      q,
      first,
      headers: { authorization: `bearer ${accessToken}` },
    });
    return toSection(data.search);
  } catch (err) {
    throw mapGraphqlError(err);
  }
}

// A revoked or expired token shows up as HTTP 401. Other GraphQL errors become a plain Error
// carrying GitHub's message.
export function mapGraphqlError(err: unknown): unknown {
  if ((err as { status?: number }).status === 401)
    return new GitHubAuthError("GitHub rejected the access token");
  if (err instanceof GraphqlResponseError) {
    return new Error(err.errors?.map((e) => e.message).join("; ") ?? "GitHub GraphQL error");
  }
  return err;
}
