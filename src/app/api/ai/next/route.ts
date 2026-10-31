import { describeError } from "@/lib/ai/client";
import { requireAiUser } from "@/lib/ai/guard";
import { rankWorkQueue } from "@/lib/ai/next-up";
import { fetchWorkQueue, type WorkItem } from "@/lib/ai/work-queue";
import { GitHubAuthError } from "@/lib/github";

export const maxDuration = 300;

const view = (w: WorkItem) => ({
  role: w.role,
  repo: w.item.repo,
  number: w.item.number,
  title: w.item.title,
  url: w.item.url,
  draft: w.item.isDraft,
  reviewDecision: w.item.reviewDecision,
  daysOpen: w.daysOpen,
  daysSinceUpdate: w.daysSinceUpdate,
});

export async function POST(request: Request) {
  const guard = await requireAiUser();
  if (!guard.ok) return guard.response;

  try {
    const queue = await fetchWorkQueue(guard.session.accessToken, guard.session.login);
    if (queue.items.length === 0) {
      return Response.json({
        summary: "Nothing is waiting on you right now.",
        ranking: [],
        unranked: [],
        truncated: false,
      });
    }
    const plan = await rankWorkQueue(queue.items, guard.ai, request.signal);
    return Response.json({
      summary: plan.summary,
      truncated: queue.truncated,
      ranking: plan.ranking.map((r) => ({
        urgency: r.urgency,
        reason: r.reason,
        nextAction: r.nextAction,
        ...view(r.work),
      })),
      unranked: plan.unranked.map(view),
    });
  } catch (err) {
    return Response.json(
      { error: describeError(err) },
      { status: err instanceof GitHubAuthError ? 401 : 502 },
    );
  }
}
