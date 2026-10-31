import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getModel, serverSettings, stopProblem, textOf } from "@/lib/ai/client";
import { loadReviewContext, reviewMessages } from "@/lib/ai/review";
import { gh, postIssueComment, type PrRef } from "@/lib/github-rest";

export const maxDuration = 300;

// Reviews new PRs automatically. Needs GITHUB_WEBHOOK_SECRET, GITHUB_BOT_TOKEN and
// WEBHOOK_REPOS (owner/name or owner/*, comma separated); with any of them missing it's off.
// The repo list matters because every review costs money.

const allowed = (repo: string) =>
  (process.env.WEBHOOK_REPOS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some(
      (rule) =>
        rule === repo.toLowerCase() ||
        (rule.endsWith("/*") && repo.toLowerCase().startsWith(rule.slice(0, -1))),
    );

function validSignature(secret: string, raw: string, header: string | null) {
  if (!header) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function reviewAndComment(token: string, ref: PrRef) {
  const ctx = await loadReviewContext(token, ref);
  const marker = `<!-- git-status-review:${ctx.pr.head.sha} -->`;

  // GitHub retries deliveries; don't review the same commit twice.
  const existing = (await (
    await gh(token, `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100`)
  ).json()) as { body?: string }[];
  if (existing.some((c) => c.body?.includes(marker))) return;
  if (!ctx.diff.trim()) return;

  const message = await getModel(serverSettings(), { maxTokens: 32000, effort: "high" }).invoke(
    reviewMessages(ctx),
  );
  if (stopProblem(message)) return; // refused or cut off: better no comment than a half review
  const text = textOf(message.content);
  if (!text.trim()) return;

  const omitted = ctx.omitted.length
    ? `\n\n_Not reviewed: ${ctx.omitted.map((o) => `\`${o.file}\``).join(", ")}._`
    : "";
  await postIssueComment(
    token,
    ref,
    `${marker}\n> 🤖 Automated review by Claude via Git Status. It can be wrong; treat it as a second pair of eyes.\n\n${text}${omitted}`,
  );
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const token = process.env.GITHUB_BOT_TOKEN;
  if (!secret || !token || !process.env.WEBHOOK_REPOS) {
    return Response.json({ error: "Webhook reviews are not configured." }, { status: 503 });
  }

  const raw = await request.text();
  if (!validSignature(secret, raw, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "Bad signature." }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true });
  if (event !== "pull_request") return Response.json({ ignored: event }, { status: 202 });

  const payload = JSON.parse(raw) as {
    action: string;
    number: number;
    repository: { name: string; full_name: string; owner: { login: string } };
    pull_request: { draft: boolean; user: { type: string } };
  };

  const reviewable =
    (payload.action === "opened" || payload.action === "ready_for_review") &&
    !payload.pull_request.draft &&
    payload.pull_request.user.type !== "Bot" &&
    allowed(payload.repository.full_name);
  if (!reviewable) return Response.json({ ignored: payload.action }, { status: 202 });

  const ref: PrRef = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    number: payload.number,
  };
  // GitHub gives webhooks ~10s to answer, so respond now and review afterwards.
  after(() =>
    reviewAndComment(token, ref).catch((err) => console.error("[webhook review] failed", ref, err)),
  );
  return Response.json({ accepted: true }, { status: 202 });
}
