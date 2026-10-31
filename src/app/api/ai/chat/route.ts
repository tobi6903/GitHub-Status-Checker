import { z } from "zod";
import { runChat } from "@/lib/ai/chat";
import { requireAiUser } from "@/lib/ai/guard";
import { ndjson } from "@/lib/ai/stream";

export const maxDuration = 300;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const guard = await requireAiUser();
  if (!guard.ok) return guard.response;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (
    !body.success ||
    body.data.messages[0].role !== "user" ||
    body.data.messages.at(-1)?.role !== "user"
  ) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { accessToken, login } = guard.session;
  return ndjson(request, (emit, signal) =>
    runChat({
      ai: guard.ai,
      history: body.data.messages,
      ctx: { token: accessToken, login },
      emit,
      signal,
    }),
  );
}
