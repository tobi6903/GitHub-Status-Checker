import { z } from "zod";
import { getModel, streamText } from "@/lib/ai/client";
import { requireAiUser } from "@/lib/ai/guard";
import { standupMessages } from "@/lib/ai/standup";
import { ndjson } from "@/lib/ai/stream";
import { fetchWorkQueue } from "@/lib/ai/work-queue";
import { fetchActivity } from "@/lib/github-activity";

export const maxDuration = 300;

const Body = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  label: z.string().max(60).default("the selected period"),
  includeLinks: z.boolean().default(true),
});

const DAY = 24 * 3600 * 1000;

export async function POST(request: Request) {
  const guard = await requireAiUser();
  if (!guard.ok) return guard.response;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { from, to, label, includeLinks } = body.data;
  const span = new Date(to).getTime() - new Date(from).getTime();
  if (span <= 0 || span > 8 * DAY) {
    return Response.json({ error: "Pick a period between 1 minute and 8 days." }, { status: 400 });
  }

  const { accessToken, login } = guard.session;
  return ndjson(request, async (emit, signal) => {
    emit({ type: "status", text: "Reading your GitHub activity…" });
    const [activity, queue] = await Promise.all([
      fetchActivity(accessToken, login, from, to),
      fetchWorkQueue(accessToken, login),
    ]);

    const counts = {
      commits: activity.commits.reduce((n, c) => n + c.count, 0),
      prsOpened: activity.pullRequestsOpened.length,
      prsMerged: activity.pullRequestsMerged.length,
      reviews: activity.reviews.length,
      issuesOpened: activity.issuesOpened.length,
      issuesClosed: activity.issuesClosed.length,
      openNow: queue.items.length,
    };
    emit({ type: "meta", data: counts });

    const total =
      counts.commits +
      counts.prsOpened +
      counts.prsMerged +
      counts.reviews +
      counts.issuesOpened +
      counts.issuesClosed;
    if (total === 0) {
      emit({
        type: "text",
        text: `No GitHub activity found for ${label}, so there is nothing to summarize.`,
      });
      return;
    }

    emit({ type: "status", text: "Writing your standup…" });
    const messages = standupMessages({
      activity,
      inProgress: queue.items,
      includeLinks,
      dateLabel: label,
    });
    await streamText(
      getModel(guard.ai, { maxTokens: 8000, effort: "low" }),
      messages,
      emit,
      signal,
    );
  });
}
