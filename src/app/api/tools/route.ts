import { NextRequest } from "next/server";
import {
  acknowledgeAlert,
  evaluateAlerts,
  listTimers,
  startTimer,
  stepTelemetry,
  type Telemetry,
} from "~/server/demoState";

export const runtime = "nodejs";

type ToolCall =
  | { name: "get_telemetry"; arguments: { fields?: string[] } }
  | { name: "acknowledge_alert"; arguments: { id: string } }
  | { name: "start_timer"; arguments: { label: string; seconds: number } };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ToolCall;
    if (!("name" in body)) return new Response("Bad Request", { status: 400 });

    if (body.name === "get_telemetry") {
      const t = stepTelemetry();
      const { fields } = body.arguments ?? {};
      let payload: Telemetry | Record<string, unknown> = t;
      if (fields && Array.isArray(fields) && fields.length > 0) {
        payload = Object.fromEntries(
          fields.map((f) => [f, (t as Record<string, unknown>)[f]]),
        );
      }
      const alerts = evaluateAlerts(t);
      return Response.json({ telemetry: payload, alerts });
    }

    if (body.name === "acknowledge_alert") {
      const id = body.arguments?.id as string | undefined;
      if (!id) return new Response("Missing id", { status: 400 });
      // Type cast is safe for known IDs in demo
      acknowledgeAlert(id as any);
      return Response.json({ ok: true });
    }

    if (body.name === "start_timer") {
      const { label, seconds } = body.arguments ?? ({} as any);
      if (!label || !seconds || seconds < 1) {
        return new Response("Missing label/seconds", { status: 400 });
      }
      const id = startTimer(label, seconds);
      return Response.json({ id, timers: listTimers() });
    }

    return new Response("Unknown tool", { status: 400 });
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }
}

