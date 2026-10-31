# Git Status

A dashboard for everything you have going on across your GitHub repositories, with an optional AI
assistant on top. Sign in with GitHub and see your open pull requests, review requests, issues and
history in one place instead of checking each repo.

## What it does

**Dashboard** (`/dashboard`)

- Open PRs you authored, with draft and review-status badges
- PRs waiting for your review
- Issues you raised and issues assigned to you
- History of merged PRs and closed issues
- Contribution totals, a month-by-month chart and a year-long activity graph
- A card per active repository that filters every list to that repo

All lists come from one GraphQL request built on GitHub search (`author:`, `assignee:`,
`review-requested:`), so repositories don't have to be listed one by one.

**AI assistant** (`/ai`), separate from the dashboard:

| Tab | What it does |
| --- | --- |
| Standup | Writes a Slack-ready standup from your commits, PRs, reviews and issues for a chosen period. The text is editable before you copy it. |
| PR review | Takes a PR URL and returns a summary, a risk level, risky changes and suggested tests. It can post the review as a PR comment, but only when you click the button and confirm. |
| What next? | Ranks your open PRs, review requests and assigned issues by urgency, with a reason and a next step for each. |
| Chat | Answers questions about your GitHub. The model calls read-only tools (search, item details, your activity, your work queue). |
| API key | Lets each user add their own Anthropic or OpenAI key. |

## Tech stack

- Next.js 16 (App Router, Cache Components), React 19, TypeScript
- Tailwind CSS v4
- Auth.js (`next-auth` v5 beta) with the GitHub provider
- GitHub GraphQL and REST APIs (`@octokit/graphql`, `fetch`)
- LangChain (`@langchain/anthropic`, `@langchain/openai`) for the AI features, so they run on either provider

This version of Next.js has breaking changes compared with older ones (for example `proxy.ts`
replaces `middleware.ts`). The docs for the installed version are in `node_modules/next/dist/docs/`.

## Getting started

You need Node.js 20.9 or newer and a GitHub account.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a GitHub OAuth app at <https://github.com/settings/developers> with:
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

3. Copy the env template and fill in the three required values:

   ```bash
   cp .env.example .env.local
   openssl rand -base64 33    # use the output as AUTH_SECRET
   ```

   Then set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` from the OAuth app.

4. Start the dev server and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

The dashboard works with just these three values. The AI tabs also need an API key (see below).

## Configuration

Everything is set through environment variables. `.env.example` has the same list with comments.

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_SECRET` | yes | Secret for session cookies. Also encrypts users' saved API keys. |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | yes | Credentials of the GitHub OAuth app. |
| `AUTH_URL` | outside Vercel | Public URL of the app, for example when using `next start` or Docker. |
| `GITHUB_OAUTH_SCOPE` | no | Defaults to `read:user repo` so private repos show up. Use `read:user` for public data only. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | no | A shared AI key for the whole app. Without one, users add their own on the API key tab. |
| `AI_PROVIDER` | no | `anthropic` or `openai`. Defaults to whichever key is set, Anthropic first. |
| `AI_MODEL` | no | Model override. Defaults to `claude-opus-5-5` (Anthropic) or `gpt-5` (OpenAI). |
| `AI_ALLOWED_LOGINS` | production | Comma-separated GitHub usernames allowed to use the shared key. |
| `GITHUB_WEBHOOK_SECRET`, `GITHUB_BOT_TOKEN`, `WEBHOOK_REPOS` | no | Turn on automatic PR reviews. See below. |

## AI assistant

### Providers and keys

The AI features go through LangChain, so Anthropic and OpenAI both work. There are two ways to supply a key:

- **Shared key.** Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on the server. Everyone allowed to use
  it spends your credits.
- **Bring your own key.** Each signed-in user can paste their own key on the **API key** tab. It is
  checked with a free request to the provider, then stored encrypted (with `AUTH_SECRET`) in an
  httpOnly cookie for 30 days. The cookie is only sent to `/api/ai/*`, so page scripts can't read
  it, and it is never logged or saved in a database. A user's own key always takes priority.

A Claude Code or claude.ai subscription login can't be used. Anthropic only allows those inside its
own apps, so the app needs an API key from the provider's console.

### Who can spend the shared key

Every AI call costs money, so in production the shared key is locked down: set `AI_ALLOWED_LOGINS`
to the GitHub usernames that may use it. Anyone else gets a 403 until they add their own key. In
development any signed-in user can use the shared key.

### Automatic PR reviews (optional)

`POST /api/webhooks/github` reviews new, non-draft PRs and comments on them. It stays off unless all
of these are set:

- `GITHUB_WEBHOOK_SECRET`: the secret you give the webhook
- `GITHUB_BOT_TOKEN`: a token that can read the repos and comment on PRs
- `WEBHOOK_REPOS`: repos that may be reviewed, as `owner/name` or `owner/*`, comma separated

In the repository settings, add a webhook pointing at `https://<your-domain>/api/webhooks/github`
with content type `application/json`, the same secret, and the **Pull requests** event. Requests
are checked against the secret, PRs from bots are skipped, and each commit is reviewed only once.
This route always uses the shared key, since there is no signed-in user.

## Deploying to Vercel

No CI setup is needed. Import the repo on Vercel and it builds on every push.

1. Add the required environment variables. Use a new `AUTH_SECRET` for production. `AUTH_URL` isn't
   needed on Vercel.
2. In the GitHub OAuth app, add `https://<your-domain>/api/auth/callback/github` as a redirect URI
   (or create a second OAuth app for production).
3. For the AI tabs, either set a shared key together with `AI_ALLOWED_LOGINS`, or leave both unset
   and let users bring their own keys.

The AI endpoints allow up to 300 seconds per request (`maxDuration`). Your Vercel plan's own limit
applies, so very large PR reviews can time out on lower limits.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run format` | Format `src` with Prettier |

There is no automated test suite yet.

## Project structure

```
src/
  auth.ts                     Auth.js setup (GitHub provider)
  proxy.ts                    Redirects signed-out visitors away from /dashboard and /ai
  app/
    page.tsx                  Landing page
    dashboard/                Dashboard page, view and error boundary
    ai/                       AI tabs (standup, review, next, chat, settings)
    api/auth/                 Auth.js route handler
    api/ai/                   AI endpoints (standup, review, next, chat, settings)
    api/webhooks/github/      Signed webhook for automatic PR reviews
  components/                 Dashboard UI (graph, repo cards, tabs, item list)
  components/ai/              AI tab UI and the streaming hook
  lib/
    github.ts                 Dashboard query and typed mapping
    github-queries.ts         GraphQL query strings
    github-activity.ts        What a user did in a time window
    github-rest.ts            REST helpers (PR diff, comments)
    session.ts                Reads the GitHub token from the session cookie
    ai/                       Provider setup, prompts, tools, access checks
```

## Security notes

- The GitHub access token stays in the encrypted session cookie and is only read on the server. It
  is not exposed through `/api/auth/session`.
- The chat tools are read-only. The only write action is the "Post as PR comment" button, which
  posts under the signed-in user's name after a confirmation.
- Text from GitHub (PR descriptions, diffs, comments) is passed to the model as untrusted data, and
  model output is rendered as markdown without raw HTML.
- Saving or removing an API key rejects requests from other origins.

## Troubleshooting

- **"redirect_uri is not associated with this application"**: the callback URL in the GitHub OAuth
  app doesn't match `/api/auth/callback/github` on the domain you're using.
- **Private repos are missing**: sign out and back in so the `repo` scope is granted, and approve
  the OAuth app in organisations that restrict third-party apps.
- **AI tabs say no key is configured**: add a key on the API key tab, or set a shared key on the
  server and restart.
- **403 on the AI tabs in production**: your username isn't in `AI_ALLOWED_LOGINS`. Add it, or add
  your own key.
- **Lists show 50 items at most**: each list shows the 50 most recently updated items. The count on
  the tab is the real total.
