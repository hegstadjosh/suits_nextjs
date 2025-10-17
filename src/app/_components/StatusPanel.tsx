"use client";

import { useEffect, useMemo, useState } from "react";

type Telemetry = {
  o2_primary_pct: number;
  o2_secondary_pct: number;
  suit_pressure_kpa: number;
  heart_bpm: number;
  co2_ppm: number;
  battery_pct: number;
  last_update_ms?: number;
};

type ActiveAlert = {
  id: string;
  level: "caution" | "warning";
  message: string;
  acknowledged?: boolean;
};

type Timer = { id: string; label: string; endsAt: number };

export function StatusPanel() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);

  // Poll tools/get_telemetry every ~1.5s so alerts are server-derived
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "get_telemetry",
            arguments: {
              fields: [
                "o2_primary_pct",
                "o2_secondary_pct",
                "suit_pressure_kpa",
                "heart_bpm",
                "co2_ppm",
                "battery_pct",
              ],
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setTelemetry(data.telemetry as Telemetry);
          setAlerts((data.alerts as ActiveAlert[]) ?? []);
        }
      } catch {}
      if (!stop) setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  // Poll timers every ~1s
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch("/api/timers");
        if (res.ok) {
          const data = await res.json();
          setTimers((data.timers as Timer[]) ?? []);
        }
      } catch {}
      if (!stop) setTimeout(tick, 1000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const hasWarning = useMemo(
    () => alerts.some((a) => a.level === "warning"),
    [alerts],
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="text-xl font-semibold">Telemetry</div>
      {telemetry ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric k="Primary O₂" v={`${Math.round(telemetry.o2_primary_pct)}%`} />
          <Metric k="Secondary O₂" v={`${Math.round(telemetry.o2_secondary_pct)}%`} />
          <Metric k="Suit Pressure" v={`${telemetry.suit_pressure_kpa.toFixed(1)} kPa`} />
          <Metric k="Heart Rate" v={`${telemetry.heart_bpm} bpm`} />
          <Metric k="CO₂" v={`${telemetry.co2_ppm} ppm`} />
          <Metric k="Battery" v={`${telemetry.battery_pct}%`} />
        </div>
      ) : (
        <div className="text-sm text-neutral-400">Loading…</div>
      )}

      <div className="mt-4 text-xl font-semibold">Active Alerts</div>
      <div className="flex flex-col gap-2">
        {alerts.length === 0 && (
          <div className="rounded-md border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-emerald-200">
            Nominal — no active alerts.
          </div>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className={
              "rounded-md px-3 py-2 text-sm " +
              (a.level === "warning"
                ? "border border-red-700 bg-red-900/40 text-red-100"
                : "border border-amber-700 bg-amber-900/30 text-amber-100")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">
                {a.level === "warning" ? "Warning" : "Caution"} — {a.message}
              </div>
              {a.acknowledged && (
                <div className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200">
                  Acknowledged
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xl font-semibold">Active Timers</div>
      <div className="flex flex-col gap-2">
        {timers.length === 0 && (
          <div className="rounded-md border border-neutral-700 bg-neutral-900/30 px-3 py-2 text-neutral-200">
            None
          </div>
        )}
        {timers.map((t) => (
          <TimerRow key={t.id} t={t} />)
        )}
      </div>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900/40 p-3">
      <div className="text-xs text-neutral-400">{k}</div>
      <div className="text-base">{v}</div>
    </div>
  );
}

function TimerRow({ t }: { t: Timer }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  const remaining = Math.max(0, t.endsAt - now);
  const totalSecs = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSecs / 60).toString();
  const ss = (totalSecs % 60).toString().padStart(2, "0");
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-700 bg-neutral-900/40 px-3 py-2">
      <div>{t.label}</div>
      <div className="font-mono">{mm}:{ss}</div>
    </div>
  );
}

