"use client";

export type RepoSummary = { name: string; prs: number; reviews: number; issues: number };

const VISIBLE = 6;

function Count({ n, one, many, tone }: { n: number; one: string; many: string; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 ${tone}`}>
      {n} {n === 1 ? one : many}
    </span>
  );
}

function RepoCard({
  repo,
  active,
  onSelect,
}: {
  repo: RepoSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const [owner, name] = repo.name.split("/");
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 pr-10 text-left transition-colors hover:bg-foreground/5 ${
          active ? "bg-foreground/5 ring-2 ring-emerald-500" : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny remote avatar */}
        <img
          src={`https://github.com/${owner}.png?size=64`}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="opacity-60">{owner}/</span>
            <span className="font-semibold">{name}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            <Count n={repo.prs} one="PR" many="PRs" tone="bg-green-500/15 text-green-600" />
            <Count
              n={repo.reviews}
              one="review"
              many="reviews"
              tone="bg-amber-500/15 text-amber-600"
            />
            <Count n={repo.issues} one="issue" many="issues" tone="bg-sky-500/15 text-sky-600" />
          </div>
        </div>
      </button>
      <a
        href={`https://github.com/${repo.name}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${repo.name} on GitHub`}
        title="Open on GitHub"
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md text-sm opacity-50 hover:bg-foreground/10 hover:opacity-100"
      >
        ↗
      </a>
    </li>
  );
}

export function RepoCards({
  repos,
  active,
  onSelect,
}: {
  repos: RepoSummary[];
  active?: string;
  onSelect: (repo?: string) => void;
}) {
  if (repos.length === 0) return null;

  const render = (list: RepoSummary[]) =>
    list.map((r) => (
      <RepoCard
        key={r.name}
        repo={r}
        active={r.name === active}
        onSelect={() => onSelect(r.name === active ? undefined : r.name)}
      />
    ));
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  const rest = repos.slice(VISIBLE);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">
          Active repositories <span className="text-sm font-normal opacity-60">{repos.length}</span>
        </h2>
        <p className="text-xs opacity-60">Click a repo to filter everything below</p>
      </div>
      <ul className={grid}>{render(repos.slice(0, VISIBLE))}</ul>
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer text-sm opacity-70 hover:opacity-100">
            <span className="group-open:hidden">Show {rest.length} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className={`${grid} mt-3`}>{render(rest)}</ul>
        </details>
      )}
    </section>
  );
}
