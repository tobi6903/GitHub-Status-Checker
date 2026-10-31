import "server-only";
import { describeError, type Emit } from "./client";

// Wraps `run` in a streaming NDJSON response. Errors it throws become an error event.
export function ndjson(
  request: Request,
  run: (emit: Emit, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client went away; nothing to deliver to.
        }
      };
      try {
        await run(emit, request.signal);
      } catch (err) {
        if (!request.signal.aborted) emit({ type: "error", message: describeError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by an abort.
        }
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
