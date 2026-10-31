import "server-only";
import { searchItems, type Item } from "@/lib/github";

export type Role = "authored_pr" | "review_requested" | "assigned_issue";

export type WorkItem = {
  // short id the model uses to refer to the item
  ref: number;
  role: Role;
  item: Item;
  daysOpen: number;
  daysSinceUpdate: number;
};

const PER_ROLE = 25;
const DAY = 24 * 3600 * 1000;

// Everything waiting on `login`: their open PRs, review requests and assigned issues.
export async function fetchWorkQueue(
  token: string,
  login: string,
): Promise<{ items: WorkItem[]; truncated: boolean }> {
  const q = (s: string) => `${s} archived:false sort:updated-desc`;
  const [mine, reviews, assigned] = await Promise.all([
    searchItems(token, q(`is:pr is:open author:${login}`), PER_ROLE),
    searchItems(token, q(`is:pr is:open review-requested:${login}`), PER_ROLE),
    searchItems(token, q(`is:issue is:open assignee:${login}`), PER_ROLE),
  ]);

  const now = Date.now();
  let ref = 0;
  const tag = (role: Role, items: Item[]): WorkItem[] =>
    items.map((item) => ({
      ref: ++ref,
      role,
      item,
      daysOpen: Math.floor((now - new Date(item.createdAt).getTime()) / DAY),
      daysSinceUpdate: Math.floor((now - new Date(item.updatedAt).getTime()) / DAY),
    }));

  return {
    items: [
      ...tag("authored_pr", mine.items),
      ...tag("review_requested", reviews.items),
      ...tag("assigned_issue", assigned.items),
    ],
    truncated: [mine, reviews, assigned].some((s) => s.total > s.items.length),
  };
}

// compact version of an item, for the prompt
export function toPromptItem(w: WorkItem) {
  const { item } = w;
  return {
    ref: w.ref,
    role: w.role,
    repo: item.repo,
    number: item.number,
    title: item.title,
    url: item.url,
    author: item.author,
    draft: item.isDraft,
    reviewDecision: item.reviewDecision,
    comments: item.comments,
    labels: item.labels.map((l) => l.name),
    daysOpen: w.daysOpen,
    daysSinceUpdate: w.daysSinceUpdate,
  };
}
