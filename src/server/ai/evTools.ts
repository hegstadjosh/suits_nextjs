import { z } from "zod";
import { tool } from "ai";
import {
  acknowledgeAlert,
  evaluateAlerts,
  listTimers,
  startTimer as startTimerImpl,
  stepTelemetry,
} from "~/server/demoState";

export function getEvTools() {
  return {
    get_telemetry: tool({
      description: "Return latest suit telemetry values.",
      inputSchema: z.object({
        fields: z.array(z.string()).optional(),
      }),
      execute: async (input: any) => {
        const fields = (input?.fields as string[] | undefined) ?? undefined;
        const t = stepTelemetry();
        const telemetry = fields && fields.length > 0
          ? Object.fromEntries(fields.map((f: string) => [f, (t as any)[f]]))
          : t;
        const alerts = evaluateAlerts(t);
        return { telemetry, alerts };
      },
    }),

    acknowledge_alert: tool({
      description: "Acknowledge and silence an active alert.",
      inputSchema: z.object({ id: z.string() }),
      execute: async (input: any) => {
        const id = String(input?.id ?? "");
        acknowledgeAlert(id as any);
        return { ok: true, id };
      },
    }),

    start_timer: tool({
      description: "Start a countdown timer for checkbacks or procedures.",
      inputSchema: z.object({ label: z.string(), seconds: z.number().min(1) }),
      execute: async (input: any) => {
        const label = String(input?.label ?? "");
        const seconds = Number(input?.seconds ?? 0);
        const id = startTimerImpl(label, seconds);
        return { id, timers: listTimers() };
      },
    }),
  } as const;
}
