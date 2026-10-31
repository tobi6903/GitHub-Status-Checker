"use client";

import Link from "next/link";
import { useState } from "react";

export const primaryButton =
  "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "rounded-lg border px-3 py-1.5 text-sm hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      className={secondaryButton}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600"
    >
      {message}
      {/API key tab/i.test(message) && (
        <>
          {" "}
          <Link href="/ai/settings" className="font-medium underline">
            Open the API key tab
          </Link>
        </>
      )}
    </p>
  );
}

export function StatusLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-center gap-2 text-sm opacity-70" aria-live="polite">
      <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
      {text}
    </p>
  );
}
