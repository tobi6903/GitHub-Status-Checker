import { signIn, signOut } from "@/auth";
import { ContributionGraph } from "@/components/ContributionGraph";
import { DashboardTabs, type TabData } from "@/components/DashboardTabs";
import type { RepoSummary } from "@/components/RepoCards";
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

  const tabs: TabData[] = TABS.map((t) => {
    const section = sectionFor(data, t.id);
    return { ...t, total: section.total, items: section.items, showCount: t.id !== "history" };
  });

  // One place for every repo: what is in flight in each one right now.
  const byRepo = new Map<string, RepoSummary>();
  const seen = new Set<string>();
  const tally = (s: Section, field: "prs" | "reviews" | "issues") => {
    for (const i of s.items) {
      if (seen.has(`${field}:${i.id}`)) continue; // an issue can be both raised by and assigned to you
      seen.add(`${field}:${i.id}`);
      const r = byRepo.get(i.repo) ?? { name: i.repo, prs: 0, reviews: 0, issues: 0 };
      r[field]++;
      byRepo.set(i.repo, r);
    }
  };
  tally(data.openPRs, "prs");
  tally(data.reviewRequests, "reviews");
  tally(data.issuesRaised, "issues");
  tally(data.issuesAssigned, "issues");
  const total = (r: RepoSummary) => r.prs + r.reviews + r.issues;
  const repos = [...byRepo.values()].sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name));

  const requestedRepo = first(sp.repo);
  const repo = repos.some((r) => r.name === requestedRepo) ? requestedRepo : undefined;

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

      <ContributionGraph weeks={data.calendar} />

      <DashboardTabs tabs={tabs} repos={repos} initialTab={tab} initialRepo={repo} now={data.fetchedAt} />
    </main>
  );
}
