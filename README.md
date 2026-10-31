# Git Status

One dashboard for everything you have going on in GitHub, across all your repositories:

- open pull requests you authored (with draft / review-decision badges)
- PRs waiting for your review
- issues you raised, and issues assigned to you
- history: merged PRs and closed issues
- contribution stats and a year-long activity graph
- an "active repositories" strip to filter every view down to one repo

Built with Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS v4,
Auth.js (GitHub sign-in) and the GitHub GraphQL API. A single GraphQL request fetches
all repos at once, using GitHub search (`author:`, `assignee:`, `review-requested:`).

## Setup

1. Create a GitHub OAuth App at <https://github.com/settings/developers>
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
2. Copy the env template and fill it in:
   ```bash
   cp .env.example .env.local
   openssl rand -base64 33   # paste as AUTH_SECRET
   # paste the OAuth app's Client ID / secret as AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
   ```
3. Run it:
   ```bash
   npm install
   npm run dev
   ```
   Open <http://localhost:3000> and sign in with GitHub.

## Notes

- The default OAuth scope is `read:user repo`, so private repos are included. Set
  `GITHUB_OAUTH_SCOPE=read:user` for public data only.
- The GitHub access token lives only in the encrypted session cookie and is read on the
  server. It is never exposed through `/api/auth/session`.
- Each list shows the 50 most recently updated items; the tab count is the real total.
- Org-owned repos with OAuth app restrictions need the app approved by the org
  (Settings → Third-party access) before their items appear.
- Deploying: set `AUTH_URL` (or deploy on Vercel), and update the OAuth callback URL.

## Layout

| Path | What |
| --- | --- |
| `src/auth.ts` | Auth.js config (GitHub provider) |
| `src/proxy.ts` | Redirects signed-out visitors away from `/dashboard` |
| `src/lib/github.ts` | The GraphQL query and typed mapping |
| `src/lib/session.ts` | Server-only access to the token inside the session cookie |
| `src/app/dashboard/` | Dashboard page, view, and error boundary |
