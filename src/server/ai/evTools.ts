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
      description:
        "Return latest suit telemetry values. Fields allowed: o2_primary_pct, o2_secondary_pct, suit_pressure_kpa, heart_bpm, co2_ppm, battery_pct. If no fields are provided, return all.",
      inputSchema: z.object({
        fields: z.array(z.enum([
          "o2_primary_pct",
          "o2_secondary_pct",
          "suit_pressure_kpa",
          "heart_bpm",
          "co2_ppm",
          "battery_pct",
        ])).optional(),
      }),
      execute: async (_input: any) => {
        // Always return full telemetry plus alerts for reliability
        const t = stepTelemetry();
        const alerts = evaluateAlerts(t);
        return { telemetry: t, alerts };
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
