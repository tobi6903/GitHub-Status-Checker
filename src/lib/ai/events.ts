// Shape of the newline-delimited JSON that the streaming AI endpoints send. Safe to import in the browser.

export type AiEvent =
  | { type: "text"; text: string } // a chunk of the answer
  | { type: "status"; text: string } // progress, e.g. "Searching: is:pr is:open"
  | { type: "meta"; data: unknown } // endpoint-specific facts about the input
  | { type: "error"; message: string };

// POSTs JSON and calls onEvent for each line of the streamed reply.
export async function streamEvents(
  url: string,
  body: unknown,
  onEvent: (e: AiEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    // Non-stream failures (401, 403, 400, ...) are plain JSON: { error }.
    const payload = await res.json().catch(() => null);
    onEvent({ type: "error", message: payload?.error ?? `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as AiEvent);
    }
  }
}
