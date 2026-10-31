"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamEvents } from "@/lib/ai/events";

export function useAiStream<Meta = unknown>() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async (url: string, body: unknown) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setText("");
    setStatus(null);
    setMeta(null);
    setError(null);
    setLoading(true);
    try {
      await streamEvents(
        url,
        body,
        (e) => {
          if (e.type === "text") setText((t) => t + e.text);
          else if (e.type === "status") setStatus(e.text);
          else if (e.type === "meta") setMeta(e.data as Meta);
          else setError(e.message);
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      if (abort.current === controller) {
        setLoading(false);
        setStatus(null);
      }
    }
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);

  return { text, setText, status, meta, error, loading, run, stop };
}
