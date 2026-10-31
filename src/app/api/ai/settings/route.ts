import { cookies } from "next/headers";
import { z } from "zod";
import { AiConfigError, defaultModel, serverSettings, type Provider } from "@/lib/ai/client";
import { serverKeyAccess } from "@/lib/ai/guard";
import {
  COOKIE_NAME,
  keyHint,
  MAX_AGE,
  readUserSettings,
  sealUserSettings,
  type UserAiSettings,
} from "@/lib/ai/user-settings";
import { getGitHubSession } from "@/lib/session";

const COOKIE_PATH = "/api/ai"; // the key is only ever sent to the AI endpoints

const Body = z.object({
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z
    .string()
    .trim()
    .min(20, "That doesn't look like a full API key.")
    .max(400, "That key is too long.")
    .regex(/^\S+$/, "A key has no spaces."),
  model: z
    .string()
    .trim()
    .max(80)
    .regex(/^[\w.:/-]*$/, "That isn't a valid model id.")
    .optional(),
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Refuse requests whose Origin isn't this site, so another page can't change settings with the user's cookies.
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function setCookie(settings: UserAiSettings) {
  (await cookies()).set(COOKIE_NAME, await sealUserSettings(settings), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: MAX_AGE,
  });
}

// Checks a key by listing models, which is free. "unknown" means the provider couldn't be reached.
async function verifyKey(
  provider: Provider,
  key: string,
): Promise<"valid" | "invalid" | "unknown"> {
  const anthropic = provider === "anthropic";
  const url = anthropic
    ? `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/models?limit=1`
    : `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/models`;
  try {
    const res = await fetch(url, {
      headers: anthropic
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.ok) return "valid";
    return res.status === 401 || res.status === 403 ? "invalid" : "unknown";
  } catch {
    return "unknown";
  }
}

// Reports which key this user will use, never the key itself.
export async function GET() {
  const session = await getGitHubSession();
  if (!session) return json({ error: "Sign in with GitHub first." }, 401);

  const own = await readUserSettings();
  if (own) {
    return json({
      source: "own",
      provider: own.provider,
      model: own.model || defaultModel(own.provider),
      hint: keyHint(own.apiKey),
    });
  }

  const access = serverKeyAccess(session.login);
  if (!access.ok) return json({ source: "none", note: access.reason });
  try {
    const server = serverSettings();
    return json({ source: "server", provider: server.provider, model: server.model });
  } catch (err) {
    return json({
      source: "none",
      note: err instanceof AiConfigError ? err.message : "No AI key is configured.",
    });
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request refused." }, 403);
  const session = await getGitHubSession();
  if (!session) return json({ error: "Sign in with GitHub first." }, 401);

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return json({ error: body.error.issues[0]?.message ?? "Invalid request." }, 400);
  const { provider, apiKey } = body.data;
  const model = body.data.model || undefined;

  const verdict = await verifyKey(provider, apiKey);
  if (verdict === "invalid") {
    return json(
      {
        error: `${provider === "anthropic" ? "Anthropic" : "OpenAI"} rejected that key. Check it and try again.`,
      },
      400,
    );
  }

  await setCookie({ provider, apiKey, model });
  return json({
    ok: true,
    verified: verdict === "valid",
    provider,
    model: model ?? defaultModel(provider),
    hint: keyHint(apiKey),
  });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request refused." }, 403);
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, path: COOKIE_PATH, maxAge: 0 });
  return json({ ok: true });
}
