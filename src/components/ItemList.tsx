import type { Item } from "@/lib/github";
import { timeAgo } from "@/lib/format";

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{children}</span>
  );
}

function StateBadge({ item }: { item: Item }) {
  if (item.kind === "pr") {
    if (item.state === "MERGED") return <Badge tone="bg-purple-500/15 text-purple-500">Merged</Badge>;
    if (item.state === "CLOSED") return <Badge tone="bg-red-500/15 text-red-500">Closed</Badge>;
    if (item.isDraft) return <Badge tone="bg-zinc-500/15 text-zinc-500">Draft</Badge>;
    return <Badge tone="bg-green-500/15 text-green-600">Open</Badge>;
  }
  if (item.state === "CLOSED") return <Badge tone="bg-purple-500/15 text-purple-500">Closed</Badge>;
  return <Badge tone="bg-green-500/15 text-green-600">Open</Badge>;
}

const REVIEW: Record<NonNullable<Item["reviewDecision"]>, [string, string]> = {
  APPROVED: ["Approved", "bg-green-500/15 text-green-600"],
  CHANGES_REQUESTED: ["Changes requested", "bg-red-500/15 text-red-500"],
  REVIEW_REQUIRED: ["Review required", "bg-amber-500/15 text-amber-600"],
};

function whenLabel(item: Item, now: number): string {
  if (item.mergedAt) return `merged ${timeAgo(item.mergedAt, now)}`;
  if (item.closedAt) return `closed ${timeAgo(item.closedAt, now)}`;
  return `updated ${timeAgo(item.updatedAt, now)}`;
}

// `now` comes from the server so the server render and client hydration agree on "5 minutes ago".
export function ItemList({ items, empty, now }: { items: Item[]; empty: string; now: number }) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm opacity-60">{empty}</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1.5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge item={item} />
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium hover:underline"
            >
              {item.title}
            </a>
            {item.reviewDecision && item.state === "OPEN" && (
              <Badge tone={REVIEW[item.reviewDecision][1]}>{REVIEW[item.reviewDecision][0]}</Badge>
            )}
            {item.labels.map((l) => (
              <span
                key={l.name}
                className="rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: `#${l.color}` }}
              >
                {l.name}
              </span>
            ))}
          </div>
          <p className="text-xs opacity-60">
            <span className="font-mono">{item.repo}</span> #{item.number} · {whenLabel(item, now)}
            {item.author ? ` · by ${item.author}` : ""}
            {item.comments > 0 ? ` · ${item.comments} comments` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
