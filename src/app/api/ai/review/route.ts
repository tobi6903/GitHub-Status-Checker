import { z } from "zod";
import { getModel, streamText } from "@/lib/ai/client";
import { requireAiUser } from "@/lib/ai/guard";
import { loadReviewContext, reviewMessages, reviewMeta } from "@/lib/ai/review";
import { ndjson } from "@/lib/ai/stream";
import { parsePrRef } from "@/lib/github-rest";

export const maxDuration = 300;

const Body = z.object({ pr: z.string().min(3).max(300) });

export async function POST(request: Request) {
  const guard = await requireAiUser();
  if (!guard.ok) return guard.response;

  const body = Body.safeParse(await request.json().catch(() => null));
  const ref = body.success ? parsePrRef(body.data.pr) : null;
  if (!ref) {
    return Response.json(
      { error: "Enter a PR URL like https://github.com/owner/repo/pull/12 or owner/repo#12." },
      { status: 400 },
    );
  }

  return ndjson(request, async (emit, signal) => {
    emit({ type: "status", text: `Fetching ${ref.owner}/${ref.repo}#${ref.number}…` });
    const ctx = await loadReviewContext(guard.session.accessToken, ref);
    emit({ type: "meta", data: reviewMeta(ctx) });

    if (!ctx.diff.trim()) {
      emit({
        type: "error",
        message:
          "There is no reviewable code in this PR (only lockfiles, generated or binary files, or an empty diff).",
      });
      return;
    }
    emit({ type: "status", text: "Reviewing the changes…" });
    await streamText(
      getModel(guard.ai, { maxTokens: 32000, effort: "high" }),
      reviewMessages(ctx),
      emit,
      signal,
    );
  });
}
