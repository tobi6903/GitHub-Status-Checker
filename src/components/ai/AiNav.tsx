"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/ai/standup", label: "Standup" },
  { href: "/ai/review", label: "PR review" },
  { href: "/ai/next", label: "What next?" },
  { href: "/ai/chat", label: "Chat" },
  { href: "/ai/settings", label: "API key" },
];

export function AiNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="AI tools">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? "border-foreground font-medium"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
