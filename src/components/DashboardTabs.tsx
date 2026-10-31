"use client";

import { useState } from "react";
import { ItemList } from "@/components/ItemList";
import { RepoCards, type RepoSummary } from "@/components/RepoCards";
import type { Item } from "@/lib/github";

export type TabData = {
  id: string;
  label: string;
  empty: string;
  total: number;
  /** Show the total next to the label. */
  showCount: boolean;
  items: Item[];
};

// Tabs and the repo filter live in client state, not in navigation: switching
// never re-fetches from GitHub or resets the scroll position. The URL is kept
// in sync with replaceState so a reload or a shared link restores the view.
export function DashboardTabs({
  tabs,
  repos,
  initialTab,
  initialRepo,
  now,
}: {
  tabs: TabData[];
  repos: RepoSummary[];
  initialTab: string;
  initialRepo?: string;
  now: number;
}) {
  const [tabId, setTabId] = useState(initialTab);
  const [repo, setRepo] = useState(initialRepo);

  function update(nextTab: string, nextRepo: string | undefined) {
    setTabId(nextTab);
    setRepo(nextRepo);
    const params = new URLSearchParams({ tab: nextTab });
    if (nextRepo) params.set("repo", nextRepo);
    window.history.replaceState(null, "", `?${params}`);
  }

  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const items = repo ? tab.items.filter((i) => i.repo === repo) : tab.items;

  return (
    <>
      <RepoCards repos={repos} active={repo} onSelect={(r) => update(tab.id, r)} />

      <section className="flex flex-col gap-4">
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Views">
          {tabs.map((t) => {
            const active = t.id === tab.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => update(t.id, repo)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm ${
                  active ? "border-foreground font-medium" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {t.label}
                {t.showCount && <span className="ml-1.5 text-xs opacity-60">{t.total}</span>}
              </button>
            );
          })}
        </nav>

        {repo && (
          <p className="text-xs opacity-70">
            Filtered to <span className="font-mono">{repo}</span> ·{" "}
            <button type="button" onClick={() => update(tab.id, undefined)} className="cursor-pointer underline">
              clear
            </button>
          </p>
        )}

        <ItemList items={items} empty={tab.empty} now={now} />

        {tab.total > tab.items.length && (
          <p className="text-xs opacity-60">
            Showing the {tab.items.length} most recent of {tab.total}.
          </p>
        )}
      </section>
    </>
  );
}
