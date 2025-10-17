import { NextRequest } from "next/server";
import { getEvTools } from "~/server/ai/evTools";
import { evaluateAlerts, stepTelemetry } from "~/server/demoState";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: Array<{ role: string; content: string }> };
  const user = messages?.at(-1)?.content ?? "";

  // Try to use Vercel AI SDK if available; fall back to simple behavior
  try {
    const aiMod = await import("ai").catch(() => null as any);
    const provider = await import("@ai-sdk/anthropic").catch(() => null as any);
    if (aiMod && provider && aiMod.generateText && provider.anthropic) {
      const { generateText } = aiMod as any;
      const { anthropic } = provider as any;
      const tools = getEvTools();

      const systemPrompt = `ROLE: Mission UI voice assistant for an astronaut.
STYLE: Concise. Report only necessary numbers and units. Use "Caution" or "Warning" labels.
TOOLS: Use tools to fetch telemetry, acknowledge alerts, and start timers. Never fabricate values.

RULES:
- On "status" requests: call get_telemetry; interpret via thresholds; respond in one sentence.
- If a Warning is active: ask "Acknowledge?" and wait; only then proceed to non-critical info.
- When user gives durations ("3 minutes"), convert to seconds and call start_timer.
- If no off-nominals: reply "Nominal" and include 2–3 key metrics.
- If required data missing: say "I don’t know" and request the missing field.
- Never suggest overriding safety interlocks or disabling alerts.`;

      const result = await generateText({
        model: anthropic("claude-sonnet-4-0"),
        messages: [
          { role: "user", content: user },
        ],
        system: systemPrompt,
        tools,
        temperature: 0.2,
      });

      // Extract tool call transcript if present (best-effort, matches econ-next inspection)
      const toolCalls: Array<{ name: string; arguments: unknown }> = [];
      const steps = (result as any)?.steps ?? [];
      for (const step of steps as any[]) {
        const invocations = (step && (step.toolInvocations || step.toolinvocations || step.toolResults || step.toolresults || step.results)) || [];
        for (const inv of invocations) {
          const name = inv?.toolName || inv?.name || inv?.tool || "";
          const args = inv?.args || inv?.arguments || inv?.input || inv?.params || undefined;
          if (name) toolCalls.push({ name, arguments: args });
        }
      }

      return Response.json({
        messages: [{ role: "assistant", content: String(result.text || "") }],
        toolCalls,
      });
    }
  } catch {}

  // Fallback: deterministic tool behavior without cloud model
  const low = user.toLowerCase();
  const toolCalls: any[] = [];
  if (/(status|check|telemetry)/.test(low)) {
    toolCalls.push({ name: "get_telemetry", arguments: { fields: ["o2_primary_pct","o2_secondary_pct","suit_pressure_kpa","co2_ppm","battery_pct","heart_bpm"] } });
    const t = stepTelemetry();
    const alerts = evaluateAlerts(t);
    let content = "Nominal.";
    if (alerts.length > 0) {
      const worst = alerts.find((a) => a.level === "warning") ?? alerts[0]!;
      const label = worst.level === "warning" ? "Warning" : "Caution";
      content = `${label}—${worst.message}.` + (worst.level === "warning" ? " Acknowledge?" : "");
    } else {
      content = `Nominal. O₂ ${Math.round(t.o2_primary_pct)}%, Pressure ${t.suit_pressure_kpa.toFixed(1)} kPa, CO₂ ${t.co2_ppm} ppm.`;
    }
    return Response.json({ messages: [{ role: "assistant", content }], toolCalls });
  }

  return Response.json({ messages: [{ role: "assistant", content: "Tool unavailable—retrying in 5 s." }], toolCalls: [] });
}
