import { NextRequest } from "next/server";
import { getAnalyticsSnapshot } from "@/lib/db/queries/analytics";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const encoder = new TextEncoder();
  let closed = false; // guard: prevent enqueue after close

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Send initial snapshot immediately
      try {
        const stats = await getAnalyticsSnapshot(campaignId);
        send(stats);
        if (stats.status === "COMPLETED" || stats.status === "FAILED") {
          close();
          return;
        }
      } catch {
        close();
        return;
      }

      // Poll every 3 seconds — stop when campaign is done
      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const updated = await getAnalyticsSnapshot(campaignId);
          send(updated);
          if (updated.status === "COMPLETED" || updated.status === "FAILED") {
            close();
          }
        } catch {
          close();
        }
      }, 3000);
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
