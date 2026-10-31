import { Suspense } from "react";
import { DashboardView } from "./DashboardView";

export const metadata = { title: "Dashboard · Git Status" };

function Skeleton() {
  return (
    <main
      className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-8 p-6"
      aria-busy="true"
    >
      <div className="flex items-center gap-4">
        <div className="size-16 rounded-full bg-foreground/10" />
        <div className="h-10 w-48 rounded bg-foreground/10" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-foreground/10" />
        ))}
      </div>
      <div className="h-32 rounded-lg bg-foreground/10" />
      <div className="h-64 rounded-lg bg-foreground/10" />
    </main>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <DashboardView searchParams={props.searchParams} />
    </Suspense>
  );
}
