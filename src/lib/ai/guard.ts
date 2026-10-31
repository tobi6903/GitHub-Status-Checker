import "server-only";
import { getGitHubSession, type GitHubSession } from "@/lib/session";
import { AiConfigError, defaultModel, serverSettings, type AiSettings } from "./client";
import { readUserSettings } from "./user-settings";

type Guard =
  { ok: true; session: GitHubSession; ai: AiSettings } | { ok: false; response: Response };

const json = (error: string, status: number) => Response.json({ error }, { status });

// Can this user spend the server's own key? In production AI_ALLOWED_LOGINS must list them
// (comma-separated GitHub usernames); in development any signed-in user can.
export function serverKeyAccess(login: string): { ok: true } | { ok: false; reason: string } {
  const allowed = (process.env.AI_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length > 0) {
    return allowed.includes(login.toLowerCase())
      ? { ok: true }
      : {
          ok: false,
          reason:
            "Your GitHub account isn't on this server's AI allow-list. Add your own API key on the API key tab.",
        };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      reason: "No shared AI key is available here. Add your own API key on the API key tab.",
    };
  }
  return { ok: true };
}

// Needs a signed-in user and an AI key. A key the user entered always wins and isn't restricted
// (they pay for it); otherwise the server's key is used, if they're allowed to.
export async function requireAiUser(): Promise<Guard> {
  const session = await getGitHubSession();
  if (!session) return { ok: false, response: json("Sign in with GitHub first.", 401) };

  const own = await readUserSettings();
  if (own) {
    return {
      ok: true,
      session,
      ai: {
        provider: own.provider,
        apiKey: own.apiKey,
        model: own.model || defaultModel(own.provider),
        source: "own",
      },
    };
  }

  const access = serverKeyAccess(session.login);
  if (!access.ok) return { ok: false, response: json(access.reason, 403) };

  try {
    return { ok: true, session, ai: serverSettings() };
  } catch (err) {
    if (err instanceof AiConfigError) return { ok: false, response: json(err.message, 503) };
    throw err;
  }
}
