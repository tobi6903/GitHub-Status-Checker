import "server-only";
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";

// Auth.js prefixes the cookie name with __Secure- on https.
const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

export type GitHubSession = { accessToken: string; login: string };

// Reads the GitHub token and login from the session cookie. Server only.
export async function getGitHubSession(): Promise<GitHubSession | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const jar = await cookies();
  for (const name of COOKIE_NAMES) {
    const value = jar.get(name)?.value;
    if (!value) continue;
    try {
      const token = await decode({ token: value, secret, salt: name });
      if (typeof token?.accessToken === "string" && typeof token.login === "string") {
        return { accessToken: token.accessToken, login: token.login };
      }
    } catch {
      // Bad or expired cookie: treat as signed out.
    }
  }
  return null;
}
