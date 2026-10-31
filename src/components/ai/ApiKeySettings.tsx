"use client";

import { useEffect, useId, useState } from "react";
import { ErrorNote, primaryButton, secondaryButton } from "./ui";

type Provider = "anthropic" | "openai";
type Status =
  | { source: "own"; provider: Provider; model: string; hint: string }
  | { source: "server"; provider: Provider; model: string }
  | { source: "none"; note?: string };

const NAMES = { anthropic: "Anthropic", openai: "OpenAI" } as const;
const PLACEHOLDER = { anthropic: "sk-ant-…", openai: "sk-…" } as const;
const DEFAULT_MODEL = { anthropic: "claude-opus-5-5", openai: "gpt-5" } as const;
const KEY_PAGE = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
} as const;

export function ApiKeySettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keyId = useId();
  const modelId = useId();

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((s) => (s.error ? setError(s.error) : setStatus(s)))
      .catch(() => setError("Couldn't load your AI settings."));
  }, []);

  async function call(method: "PUT" | "DELETE") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method,
        headers: { "content-type": "application/json" },
        body:
          method === "PUT"
            ? JSON.stringify({ provider, apiKey, model: model.trim() || undefined })
            : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setApiKey("");
      if (method === "PUT") {
        setNotice(
          data.verified
            ? "Key saved and verified."
            : "Key saved, but couldn't be verified right now. It will be tried on your next request.",
        );
      } else {
        setNotice("Your key was removed.");
      }
      setStatus(await (await fetch("/api/ai/settings")).json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <p className="text-sm opacity-70">
        Use your own provider account for the AI tools. Your key is used for your requests only, and
        you pay your provider directly.
      </p>

      <div className="rounded-xl border p-4 text-sm" aria-live="polite">
        {!status ? (
          <span className="opacity-60">Checking…</span>
        ) : status.source === "own" ? (
          <>
            Using <strong>your {NAMES[status.provider]} key</strong>{" "}
            <span className="font-mono opacity-70">{status.hint}</span> with model{" "}
            <span className="font-mono">{status.model}</span>.
          </>
        ) : status.source === "server" ? (
          <>
            Using this site&apos;s shared <strong>{NAMES[status.provider]}</strong> key (model{" "}
            <span className="font-mono">{status.model}</span>). Add your own below to use your
            account instead.
          </>
        ) : (
          <>No AI key is available yet. {status.note}</>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          call("PUT");
        }}
        className="flex flex-col gap-4"
      >
        <fieldset className="flex gap-2" aria-label="Provider">
          {(["anthropic", "openai"] as const).map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${provider === p ? "border-foreground bg-foreground/5 font-medium" : "hover:bg-foreground/5"}`}
            >
              <input
                type="radio"
                name="provider"
                checked={provider === p}
                onChange={() => setProvider(p)}
              />
              {NAMES[p]}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={keyId} className="text-sm font-medium">
            {NAMES[provider]} API key
          </label>
          <input
            id={keyId}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={PLACEHOLDER[provider]}
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg border bg-transparent px-3 py-2 font-mono text-sm"
          />
          <a
            href={KEY_PAGE[provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-600 hover:underline"
          >
            Get a key from {NAMES[provider]} ↗
          </a>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={modelId} className="text-sm font-medium">
            Model <span className="font-normal opacity-60">(optional)</span>
          </label>
          <input
            id={modelId}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL[provider]}
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg border bg-transparent px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button className={primaryButton} disabled={busy || apiKey.trim().length < 20}>
            {busy ? "Saving…" : "Save key"}
          </button>
          {status?.source === "own" && (
            <button
              type="button"
              onClick={() => call("DELETE")}
              disabled={busy}
              className={secondaryButton}
            >
              Remove my key
            </button>
          )}
        </div>
      </form>

      {error && <ErrorNote message={error} />}
      {notice && (
        <p className="text-sm text-emerald-600" role="status">
          {notice}
        </p>
      )}

      <ul className="list-disc space-y-1 pl-5 text-xs opacity-60">
        <li>
          The key is stored encrypted in an httpOnly cookie for 30 days. It is never readable by
          page scripts, never logged, and only sent to this app&apos;s AI endpoints.
        </li>
        <li>It is verified with a free request to the provider when you save it.</li>
        <li>
          Claude Code and claude.ai subscription logins can&apos;t be used here. Anthropic only
          allows them inside its own apps. Use an API key from the Anthropic Console.
        </li>
      </ul>
    </section>
  );
}
