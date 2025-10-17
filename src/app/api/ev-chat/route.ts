import { NextRequest } from "next/server";
import { getEvTools } from "~/server/ai/evTools";
import { evaluateAlerts, stepTelemetry } from "~/server/demoState";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: Array<{ role: string; content: string }> };
  const user = messages?.at(-1)?.content ?? "";
  const convo = (messages || []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));

  // Try to use Vercel AI SDK if available; fall back to simple behavior
  try {
    const aiMod = await import("ai").catch(() => null as any);
    const provider = await import("@ai-sdk/anthropic").catch(() => null as any);
    if (aiMod && provider && aiMod.generateText && provider.anthropic) {
      const { generateText } = aiMod as any;
      const { anthropic } = provider as any;
      const tools = getEvTools();

      const systemPrompt = `You are a mission UI voice assistant for an astronaut. Be helpful, natural, and concise. Use available tools to fetch telemetry, acknowledge alerts, and manage timers when needed. Ground answers in tool outputs and do not invent values.`;

      const result = await generateText({
        model: anthropic("claude-sonnet-4-0"),
        messages: convo,
        system: systemPrompt,
        // Keep tools for action intents (acknowledge, start_timer). Telemetry was injected above.
        tools,
        temperature: 0.2,
      });

      // Extract tool call transcript and collect any tool results
      const toolCalls: Array<{ name: string; arguments: unknown }> = [];
      const steps = (result as any)?.steps ?? [];
      let derivedText = (result as any)?.text ? String((result as any).text) : "";

      // Try to derive a concise status message from tool results if model produced no text
      let lastTelemetry: any = null;
      let lastAlerts: any[] | null = null;
      for (const step of steps as any[]) {
        const invocations = (step && (step.toolInvocations || step.toolinvocations || step.toolResults || step.toolresults || step.results)) || [];
        for (const inv of invocations) {
          const name = inv?.toolName || inv?.name || inv?.tool || "";
          const args = inv?.args || inv?.arguments || inv?.input || inv?.params || undefined;
          if (name) toolCalls.push({ name, arguments: args });
          // Capture get_telemetry results when available
          const res = inv?.result ?? inv?.output ?? inv?.data ?? undefined;
          if (name && String(name).includes("get_telemetry") && res) {
            try {
              const parsed = typeof res === "string" ? JSON.parse(res) : res;
              if (parsed && typeof parsed === "object") {
                lastTelemetry = (parsed as any).telemetry ?? lastTelemetry;
                lastAlerts = ((parsed as any).alerts as any[]) ?? lastAlerts;
              }
            } catch {}
          }
        }
      }
      // If model produced only a placeholder (e.g., "I'll check"), trigger a concise summary pass using tool outputs
      const isGeneric = (s: string) => /\b(i('|’)ll|i will) check\b|let me (check|look)|i can help|what do you need|hello!?/i.test(s);
      const hasNumbersFrom = (s: string, t: any) => {
        try {
          const probes: string[] = [];
          if (t) {
            const o2 = Math.round(Number(t.o2_primary_pct ?? NaN));
            const sec = Math.round(Number(t.o2_secondary_pct ?? NaN));
            const pres = (Number(t.suit_pressure_kpa ?? NaN)).toFixed(1);
            const co2 = String(Number(t.co2_ppm ?? NaN));
            const batt = String(Number(t.battery_pct ?? NaN));
            const hr = String(Number(t.heart_bpm ?? NaN));
            if (!Number.isNaN(o2)) probes.push(String(o2));
            if (!Number.isNaN(sec)) probes.push(String(sec));
            if (pres && pres !== "NaN") probes.push(pres);
            if (!co2.includes("NaN")) probes.push(co2);
            if (!batt.includes("NaN")) probes.push(batt);
            if (!hr.includes("NaN")) probes.push(hr);
          }
          return probes.some((p) => p && s.includes(p));
        } catch { return false; }
      };
      const needSummary = !derivedText || !derivedText.trim() || isGeneric(derivedText);
      if (needSummary) {
        // 2nd pass: ask the model to craft the final sentence using tool outputs (no tools on this pass)
        const summarySystem = `You are a mission UI assistant for an astronaut. Answer naturally and concisely. Base your reply only on the provided tool outputs. Include numbers and units when helpful. If information is missing, say you don't know.`;
        const t2 = lastTelemetry ?? stepTelemetry();
        const a2 = lastAlerts ?? evaluateAlerts(t2);
        const summaryInput = { telemetry: t2, alerts: a2, userQuery: user };
        const summary = await generateText({
          model: anthropic("claude-sonnet-4-0"),
          system: summarySystem,
          messages: [
            { role: "user", content: `Tool outputs (JSON):\n${JSON.stringify(summaryInput)}\n\nRespond to the user's question using only this data.` },
          ],
          temperature: 0.2,
        });
        derivedText = String((summary as any)?.text || "").trim();
        // No server-crafted fallback to avoid non-LLM text; let UI show nothing if the model still returns empty.
      }

      return Response.json({
        messages: [{ role: "assistant", content: derivedText }],
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
