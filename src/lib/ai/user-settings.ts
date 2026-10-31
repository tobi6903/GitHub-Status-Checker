import "server-only";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { z } from "zod";
import type { Provider } from "./client";

// A user's own API key is kept in an httpOnly cookie, encrypted with AUTH_SECRET (Auth.js's JWE
// helpers), and only sent to /api/ai/*.
export const COOKIE_NAME = "git-status-ai";
const SALT = "git-status-ai-settings";
export const MAX_AGE = 60 * 60 * 24 * 30;

const Stored = z.object({
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});
export type UserAiSettings = { provider: Provider; apiKey: string; model?: string };

export async function readUserSettings(): Promise<UserAiSettings | null> {
  const secret = process.env.AUTH_SECRET;
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!secret || !value) return null;
  try {
    const parsed = Stored.safeParse(await decode({ token: value, secret, salt: SALT }));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // tampered, expired or sealed with an old secret
  }
}

export async function sealUserSettings(settings: UserAiSettings): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return encode({ token: { ...settings }, secret, salt: SALT, maxAge: MAX_AGE });
}

// last four characters, so people can tell which key is saved
export const keyHint = (key: string) => `…${key.slice(-4)}`;
