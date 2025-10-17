import { NextRequest } from "next/server";

export const runtime = "nodejs";

type Message = { role: "user" | "assistant" | "tool"; content: string };

function parseDurationToSeconds(text: string): number | null {
  // Very naive duration parser: "3 minute(s)" or "180 seconds" etc.
  const m = text.match(/(\d+)\s*(sec|secs|second|seconds|min|mins|minute|minutes)/i);
  if (!m) return null;
  const n = parseInt(m[1] ?? "0", 10);
  const unit = (m[2] ?? "").toLowerCase();
  if (["sec", "secs", "second", "seconds"].includes(unit)) return n;
  if (["min", "mins", "minute", "minutes"].includes(unit)) return n * 60;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { messages: Message[] };
    const last = body.messages.at(-1);
    if (!last || last.role !== "user") {
      return Response.json({ messages: [] });
    }

    const userText = last.content.toLowerCase();
    const toolCalls: any[] = [];
    const toolOutputs: any[] = [];

    // Tool: get_telemetry for any status checks
    if (/(status|check|telemetry)/.test(userText)) {
      const args = {
        fields: [
          "o2_primary_pct",
          "o2_secondary_pct",
          "suit_pressure_kpa",
          "co2_ppm",
          "battery_pct",
          "heart_bpm",
        ],
      };
      toolCalls.push({ name: "get_telemetry", arguments: args });
      const res = await fetch(`${new URL(req.url).origin}/api/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "get_telemetry", arguments: args }),
      });
      const data = await res.json();
      toolOutputs.push({ name: "get_telemetry", result: data });

      const t = data.telemetry as Record<string, number>;
      const alerts = (data.alerts as any[]) ?? [];
      let content = "Nominal. ";
      if (alerts.length > 0) {
        const worst = alerts.find((a) => a.level === "warning") ?? alerts[0];
        if (worst) {
          const label = worst.level === "warning" ? "Warning" : "Caution";
          content = `${label}—${worst.message}.`;
          if (worst.level === "warning") content += " Acknowledge?";
        }
      } else {
        // include 2–3 key metrics
        const o2 = Math.round(Number(t.o2_primary_pct ?? 0));
        const pres = Number(t.suit_pressure_kpa ?? 0).toFixed(1);
        const co2 = Number(t.co2_ppm ?? 0);
        content = `Nominal. O₂ ${o2}%, Pressure ${pres} kPa, CO₂ ${co2} ppm.`;
      }

      return Response.json({
        messages: [
          { role: "assistant", content },
        ],
        toolCalls,
        toolOutputs,
      });
    }

    // Tool: acknowledge_alert + start_timer
    if (/ack/.test(userText) || /acknowledge/.test(userText) || /start/.test(userText)) {
      // default ack O2_LOW if mentioned
      if (/ack/.test(userText)) {
        toolCalls.push({ name: "acknowledge_alert", arguments: { id: "O2_LOW" } });
        await fetch(`${new URL(req.url).origin}/api/tools`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "acknowledge_alert", arguments: { id: "O2_LOW" } }),
        });
        toolOutputs.push({ name: "acknowledge_alert", result: { ok: true } });
      }

      let timerMsg = "";
      const secs = parseDurationToSeconds(userText);
      const labelMatch = userText.match(/timer\s*(?:for|:)?\s*([a-z0-9 \-']+)/i) || userText.match(/start\s+a?\s*([a-z0-9 \-']+)\s*timer/i);
      const label = labelMatch?.[1]?.trim() || "check";
      if (secs && secs > 0) {
        toolCalls.push({ name: "start_timer", arguments: { label, seconds: secs } });
        const res2 = await fetch(`${new URL(req.url).origin}/api/tools`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "start_timer", arguments: { label, seconds: secs } }),
        });
        const data2 = await res2.json();
        toolOutputs.push({ name: "start_timer", result: data2 });
        const mm = Math.floor(secs / 60).toString();
        const ss = (secs % 60).toString().padStart(2, "0");
        timerMsg = ` Timer '${label}' set for ${mm}:${ss}.`;
      }

      const ackPrefix = /ack/.test(userText) ? "Acknowledged O2 warning." : "";
      const content = `${ackPrefix}${timerMsg}`.trim() || "OK.";

      return Response.json({
        messages: [
          { role: "assistant", content },
        ],
        toolCalls,
        toolOutputs,
      });
    }

    // Fallback
    return Response.json({
      messages: [
        { role: "assistant", content: "Tool unavailable—retrying in 5 s." },
      ],
      toolCalls: [],
      toolOutputs: [],
    });
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }
}
