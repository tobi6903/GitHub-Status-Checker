import "server-only";
import { graphql, GraphqlResponseError } from "@octokit/graphql";

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
  /** Epoch ms when this data was fetched; used as "now" for relative times. */
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

/** `total` is GitHub's full count; `items` is capped at PAGE_SIZE. */
export type Section = { total: number; items: Item[] };

const PAGE_SIZE = 50;

// `state` has a different enum type on Issue and PullRequest, so each gets its own alias.
const ITEM_FIELDS = /* GraphQL */ `
  fragment ItemFields on Issue {
    __typename id number title url issueState: state createdAt updatedAt closedAt
    repository { nameWithOwner }
    author { login }
    comments { totalCount }
    labels(first: 5) { nodes { name color } }
  }
  fragment PRFields on PullRequest {
    __typename id number title url prState: state isDraft reviewDecision createdAt updatedAt closedAt mergedAt
    repository { nameWithOwner }
    author { login }
    comments { totalCount }
    labels(first: 5) { nodes { name color } }
  }
`;

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
function toItem(node: any): Item | null {
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

function toSection(search: any): Section {
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
    const data = await graphql<any>(QUERY, { // eslint-disable-line @typescript-eslint/no-explicit-any
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
          w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, color: d.color })),
      ),
      openPRs: toSection(data.openPRs),
      reviewRequests: toSection(data.reviewRequests),
      issuesRaised: toSection(data.issuesRaised),
      issuesAssigned: toSection(data.issuesAssigned),
      mergedPRs: toSection(data.mergedPRs),
      closedIssues: toSection(data.closedIssues),
    };
  } catch (err) {
    // Revoked/expired token comes back as HTTP 401 from the GraphQL endpoint.
    if ((err as { status?: number }).status === 401) {
      throw new GitHubAuthError("GitHub rejected the access token");
    }
    if (err instanceof GraphqlResponseError) {
      throw new Error(err.errors?.map((e) => e.message).join("; ") ?? "GitHub GraphQL error");
    }
    throw err;
  }
}
