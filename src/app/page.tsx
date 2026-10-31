import Link from "next/link";
import { Suspense } from "react";
import { auth, signIn } from "@/auth";

async function Cta() {
  const session = await auth();
  if (session) {
    return (
      <Link
        href="/dashboard"
        className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Open dashboard
      </Link>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github", { redirectTo: "/dashboard" });
      }}
    >
      <button className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background">
        Sign in with GitHub
      </button>
    </form>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Git Status</h1>
      <p className="text-lg opacity-70">
        Every pull request, issue, review request and past contribution across all your GitHub
        repositories, in one place.
      </p>
      <Suspense fallback={<div className="h-10" />}>
        <Cta />
      </Suspense>
    </main>
  );
}
