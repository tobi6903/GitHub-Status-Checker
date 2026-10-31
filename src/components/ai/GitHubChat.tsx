"use client";

import { useEffect, useRef, useState } from "react";
import { streamEvents } from "@/lib/ai/events";
import { Markdown } from "./Markdown";
import { ErrorNote, secondaryButton } from "./ui";

type Msg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  steps: string[];
  error?: string;
};

const SUGGESTIONS = [
  "Which of my open PRs have been waiting the longest?",
  "What did I merge in the last 7 days?",
  "Do I have review requests I've been ignoring?",
  "Summarize my open issues by repo",
];

export function GitHubChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const pinned = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Follow the stream only while the reader is already at the bottom.
  useEffect(() => {
    const onScroll = () => {
      pinned.current =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY < 140;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const user: Msg = { id: nextId.current++, role: "user", content: question, steps: [] };
    const reply: Msg = { id: nextId.current++, role: "assistant", content: "", steps: [] };
    // Only completed turns go back to the server; failed or empty replies are dropped.
    const history = [...messages, user]
      .filter((m) => m.content && !m.error)
      .map(({ role, content }) => ({ role, content }));

    pinned.current = true;
    setMessages((m) => [...m, user, reply]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abort.current = controller;
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((all) => all.map((m) => (m.id === reply.id ? fn(m) : m)));

    try {
      await streamEvents(
        "/api/ai/chat",
        { messages: history },
        (e) => {
          if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.text }));
          else if (e.type === "status") patch((m) => ({ ...m, steps: [...m.steps, e.text] }));
          else if (e.type === "error") patch((m) => ({ ...m, error: e.message }));
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted)
        patch((m) => ({ ...m, error: err instanceof Error ? err.message : "Request failed." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm opacity-70">
            Ask anything about your PRs, issues and activity. Claude looks things up on GitHub as it
            answers.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border px-3 py-1.5 text-sm hover:bg-foreground/5"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-2xl bg-foreground px-4 py-2 text-sm text-background">
                  {m.content}
                </p>
              ) : (
                <div className="flex max-w-full flex-col gap-2">
                  {m.steps.length > 0 && (
                    <ul className="flex flex-col gap-1 text-xs opacity-60">
                      {m.steps.map((s, i) => (
                        <li key={i} className="truncate">
                          🔎 {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.content ? (
                    <Markdown>{m.content}</Markdown>
                  ) : (
                    !m.error && <p className="animate-pulse text-sm opacity-60">Thinking…</p>
                  )}
                  {m.error && <ErrorNote message={m.error} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div ref={bottom} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 flex gap-2 bg-background py-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask about your GitHub
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your GitHub…"
          maxLength={2000}
          className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm"
        />
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()} className={secondaryButton}>
            Stop
          </button>
        ) : (
          <>
            {messages.length > 0 && (
              <button type="button" onClick={() => setMessages([])} className={secondaryButton}>
                New chat
              </button>
            )}
            <button
              disabled={!input.trim()}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </>
        )}
      </form>
    </section>
  );
}
