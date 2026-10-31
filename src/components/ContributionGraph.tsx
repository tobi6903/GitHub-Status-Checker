import type { ContributionDay } from "@/lib/github";

export function ContributionGraph({ weeks }: { weeks: ContributionDay[][] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max gap-[3px]" role="img" aria-label="Contribution activity over the last year">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.count} contributions on ${day.date}`}
                className="size-[11px] rounded-[2px]"
                style={{ backgroundColor: day.color }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
