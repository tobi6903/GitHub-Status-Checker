import { z } from "zod";
import { describeError } from "@/lib/ai/client";
import { requireAiUser } from "@/lib/ai/guard";
import { parsePrRef, postIssueComment } from "@/lib/github-rest";

const Body = z.object({ pr: z.string().min(3).max(300), body: z.string().min(1).max(60_000) });

// Posts a generated review as a PR comment. Uses the user's token, so it shows under their name.
export async function POST(request: Request) {
  const guard = await requireAiUser();
  if (!guard.ok) return guard.response;

  const body = Body.safeParse(await request.json().catch(() => null));
  const ref = body.success ? parsePrRef(body.data.pr) : null;
  if (!body.success || !ref) return Response.json({ error: "Invalid request." }, { status: 400 });

  const text = `> 🤖 AI-generated review by Claude, posted by @${guard.session.login} via Git Status.\n\n${body.data.body}`;
  try {
    const comment = await postIssueComment(guard.session.accessToken, ref, text);
    return Response.json({ url: comment.html_url });
  } catch (err) {
    return Response.json({ error: describeError(err) }, { status: 502 });
  }
}
