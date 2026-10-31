import Link from "next/link";
import { signIn, signOut } from "@/auth";
import { ContributionGraph } from "@/components/ContributionGraph";
import { ItemList } from "@/components/ItemList";
import {
  fetchDashboard,
  GitHubAuthError,
  type Dashboard,
  type Item,
  type Section,
} from "@/lib/github";
import { getGitHubSession } from "@/lib/session";
import { redirect } from "next/navigation";

const TABS = [
  { id: "prs", label: "Open PRs", empty: "No open pull requests." },
  { id: "reviews", label: "Review requests", empty: "Nobody is waiting on your review." },
  { id: "issues", label: "Issues raised", empty: "You have no open issues." },
  { id: "assigned", label: "Assigned to me", empty: "No issues assigned to you." },
  { id: "history", label: "History", empty: "No merged PRs or closed issues yet." },
] as const;

type TabId = (typeof TABS)[number]["id"];

function sectionFor(data: Dashboard, tab: TabId): Section {
  switch (tab) {
    case "prs":
      return data.openPRs;
    case "reviews":
      return data.reviewRequests;
    case "issues":
      return data.issuesRaised;
    case "assigned":
      return data.issuesAssigned;
    case "history": {
      const items = [...data.mergedPRs.items, ...data.closedIssues.items].sort(
        (a, b) => when(b).localeCompare(when(a)),
      );
      return { total: data.mergedPRs.total + data.closedIssues.total, items };
    }
  }
}

const when = (i: Item) => i.mergedAt ?? i.closedAt ?? i.updatedAt;

function href(tab: TabId, repo?: string) {
  const params = new URLSearchParams({ tab });
  if (repo) params.set("repo", repo);
  return `/dashboard?${params}`;
}

function ReconnectCard() {
  return (
    <main className="mx-auto max-w-md p-12 text-center">
      <h1 className="text-xl font-semibold">Your GitHub session expired</h1>
      <p className="mt-2 text-sm opacity-70">GitHub rejected the saved token. Sign in again to continue.</p>
      <form
        className="mt-6"
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
      >
        <button className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          Sign in with GitHub
        </button>
      </form>
    </main>
  );
}

export async function DashboardView({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getGitHubSession();
  if (!session) redirect("/");

  let data: Dashboard;
  try {
    data = await fetchDashboard(session.accessToken, session.login);
  } catch (err) {
    if (err instanceof GitHubAuthError) return <ReconnectCard />;
    throw err;
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = TABS.find((t) => t.id === first(sp.tab))?.id ?? "prs";
  const repo = first(sp.repo);

  const section = sectionFor(data, tab);
  const items = repo ? section.items.filter((i) => i.repo === repo) : section.items;

  // One place for every repo: how much is in flight in each one right now.
  const byRepo = new Map<string, number>();
  const seen = new Set<string>();
  for (const s of [data.openPRs, data.reviewRequests, data.issuesRaised, data.issuesAssigned]) {
    for (const i of s.items) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      byRepo.set(i.repo, (byRepo.get(i.repo) ?? 0) + 1);
    }
  }
  const repos = [...byRepo].sort((a, b) => b[1] - a[1]);

  const { profile, stats } = data;
  const statCards = [
    ["Commits", stats.commits],
    ["Pull requests", stats.pullRequests],
    ["Issues", stats.issues],
    ["Reviews", stats.reviews],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, no optimisation needed */}
        <img src={profile.avatarUrl} alt="" className="size-16 rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{profile.name ?? profile.login}</h1>
          <a href={profile.url} target="_blank" rel="noreferrer" className="text-sm opacity-70 hover:underline">
            @{profile.login}
          </a>
          {profile.bio && <p className="mt-1 text-sm opacity-80">{profile.bio}</p>}
          <p className="mt-1 text-xs opacity-60">
            {profile.followers} followers · {profile.following} following · {profile.publicRepos} public repos
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-foreground/5">Sign out</button>
        </form>
      </header>

      <section aria-label="Last year" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-4">
            <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
            <div className="text-xs opacity-60">{label} this year</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">
          {stats.total.toLocaleString()} contributions in the last year
        </h2>
        <ContributionGraph weeks={data.calendar} />
      </section>

      {repos.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Active repositories</h2>
          <div className="flex flex-wrap gap-2">
            {repos.map(([name, count]) => (
              <Link
                key={name}
                href={href(tab, name === repo ? undefined : name)}
                className={`rounded-full border px-3 py-1 text-xs font-mono ${
                  name === repo ? "bg-foreground text-background" : "hover:bg-foreground/5"
                }`}
              >
                {name} · {count}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Views">
          {TABS.map((t) => {
            const count = t.id === "history" ? null : sectionFor(data, t.id).total;
            const active = t.id === tab;
            return (
              <Link
                key={t.id}
                href={href(t.id, repo)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  active ? "border-foreground font-medium" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {t.label}
                {count !== null && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
              </Link>
            );
          })}
        </nav>

        {repo && (
          <p className="text-xs opacity-70">
            Filtered to <span className="font-mono">{repo}</span> ·{" "}
            <Link href={href(tab)} className="underline">
              clear
            </Link>
          </p>
        )}

        <ItemList items={items} empty={TABS.find((t) => t.id === tab)!.empty} />

        {section.total > section.items.length && (
          <p className="text-xs opacity-60">
            Showing the {section.items.length} most recent of {section.total}.
          </p>
        )}
      </section>
    </main>
  );
}
