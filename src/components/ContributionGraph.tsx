import type { ContributionDay } from "@/lib/github";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Literal class names so Tailwind can see them. Uses opacity, not fixed hex,
// so the graph looks right in both light and dark mode.
const LEVELS = [
  "bg-foreground/10",
  "bg-emerald-500/30",
  "bg-emerald-500/50",
  "bg-emerald-500/75",
  "bg-emerald-500",
];

const CELL = 12; // px
const GAP = 3; // px

const monthIndex = (date: string) => Number(date.slice(5, 7)) - 1;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function level(count: number, max: number) {
  if (count === 0 || max === 0) return 0;
  return Math.max(1, Math.ceil((count / max) * 4));
}

type Month = { key: string; label: string; year: string | null; total: number };

function monthlyTotals(days: ContributionDay[]): Month[] {
  const map = new Map<string, Month>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    let m = map.get(key);
    if (!m) {
      const isJan = monthIndex(d.date) === 0;
      m = {
        key,
        label: MONTHS[monthIndex(d.date)],
        // Show the year only where it changes, so the axis stays readable.
        year: isJan || map.size === 0 ? d.date.slice(0, 4) : null,
        total: 0,
      };
      map.set(key, m);
    }
    m.total += d.count;
  }
  return [...map.values()];
}

export function ContributionGraph({ weeks }: { weeks: ContributionDay[][] }) {
  const days = weeks.flat();
  if (days.length === 0) return null;

  const total = days.reduce((sum, d) => sum + d.count, 0);
  const months = monthlyTotals(days);
  const peak = Math.max(...months.map((m) => m.total));
  const maxDay = Math.max(...days.map((d) => d.count));

  const fmt = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
  const range = `${fmt.format(new Date(days[0].date))} – ${fmt.format(new Date(days[days.length - 1].date))}`;

  // Month label above the first week column of each month. Drop the first one
  // when the next follows right behind it, otherwise the two overlap.
  const labels: { week: number; text: string }[] = [];
  weeks.forEach((week, i) => {
    const m = monthIndex(week[0].date);
    if (i === 0 || m !== monthIndex(weeks[i - 1][0].date)) labels.push({ week: i, text: MONTHS[m] });
  });
  if (labels.length > 1 && labels[1].week - labels[0].week < 3) labels.shift();
  const labelAt = new Map(labels.map((l) => [l.week, l.text]));

  return (
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">
          <span className="tabular-nums">{total.toLocaleString()}</span> contributions in the last year
        </h2>
        <p className="text-xs opacity-60">{range}</p>
      </div>

      {/* Month by month */}
      <div
        className="mt-6 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Contributions per month: ${months.map((m) => `${m.label} ${m.total}`).join(", ")}`}
      >
        {months.map((m) => {
          const isPeak = m.total === peak && peak > 0;
          return (
            <div key={m.key} className="flex flex-col items-center gap-1.5">
              <span className={`text-xs tabular-nums ${m.total === 0 ? "opacity-40" : "font-medium"}`}>
                {m.total}
              </span>
              <div className="flex h-24 w-full items-end">
                <div
                  title={`${m.total} contributions in ${m.label} ${m.key.slice(0, 4)}`}
                  className={`w-full rounded-t-md ${isPeak ? "bg-emerald-500" : "bg-emerald-500/45"}`}
                  style={{ height: m.total === 0 ? 3 : `${Math.max(6, (m.total / peak) * 100)}%` }}
                />
              </div>
              <span className="text-xs leading-tight opacity-70">{m.label}</span>
              <span className="h-3 text-[10px] leading-3 opacity-40">{m.year ?? ""}</span>
            </div>
          );
        })}
      </div>

      <hr className="my-5" />

      {/* Day by day */}
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max" style={{ gap: GAP }}>
          <div className="flex flex-col pr-1 text-[10px] opacity-50" style={{ gap: GAP, paddingTop: CELL + GAP }}>
            {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
              <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                {d}
              </span>
            ))}
          </div>

          {weeks.map((week, i) => {
            // Put each day in its weekday row so a partial first/last week lines up.
            const slots: (ContributionDay | null)[] = Array(7).fill(null);
            for (const d of week) slots[weekday(d.date)] = d;
            return (
              <div key={i} className="flex flex-col" style={{ gap: GAP, width: CELL }}>
                <span
                  className="relative whitespace-nowrap text-[10px] opacity-60"
                  style={{ height: CELL, lineHeight: `${CELL}px` }}
                >
                  {labelAt.get(i)}
                </span>
                {slots.map((d, row) =>
                  d ? (
                    <div
                      key={d.date}
                      title={`${d.count} contribution${d.count === 1 ? "" : "s"} on ${d.date}`}
                      className={`rounded-[3px] ${LEVELS[level(d.count, maxDay)]}`}
                      style={{ width: CELL, height: CELL }}
                    />
                  ) : (
                    <div key={row} style={{ width: CELL, height: CELL }} />
                  ),
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] opacity-60">
        Less
        {LEVELS.map((cls) => (
          <span key={cls} className={`rounded-[3px] ${cls}`} style={{ width: CELL, height: CELL }} />
        ))}
        More
      </div>
    </section>
  );
}
