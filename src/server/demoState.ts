// In-memory demo state for telemetry, alerts, and timers
// Note: resets on server restart or reload; fine for demo purposes.

export type Telemetry = {
  o2_primary_pct: number;
  o2_secondary_pct: number;
  suit_pressure_kpa: number;
  heart_bpm: number;
  co2_ppm: number;
  battery_pct: number;
  last_update_ms?: number;
};

export type Timer = { id: string; label: string; endsAt: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function jitter(x: number, d: number, min: number, max: number) {
  const v = x + (Math.random() * 2 - 1) * d;
  return clamp(v, min, max);
}

// Seeded starting state
const initialTelemetry: Telemetry = {
  o2_primary_pct: 52,
  o2_secondary_pct: 100,
  suit_pressure_kpa: 29.8,
  heart_bpm: 98,
  co2_ppm: 4500,
  battery_pct: 28,
};
let telemetryState: Telemetry = { ...initialTelemetry };

// For demo trending
let demoTick = 0;

export function stepTelemetry(mode?: string): Telemetry {
  // random walk
  telemetryState.o2_primary_pct = jitter(telemetryState.o2_primary_pct, 1, 20, 100);
  telemetryState.o2_secondary_pct = jitter(telemetryState.o2_secondary_pct, 0.5, 50, 100);
  telemetryState.suit_pressure_kpa = jitter(telemetryState.suit_pressure_kpa, 0.2, 25, 32);
  telemetryState.heart_bpm = Math.round(jitter(telemetryState.heart_bpm, 3, 60, 160));
  telemetryState.co2_ppm = Math.round(jitter(telemetryState.co2_ppm, 200, 300, 12000));
  telemetryState.battery_pct = clamp(
    telemetryState.battery_pct - (Math.random() < 0.2 ? 1 : 0),
    0,
    100,
  );

  if (mode === "demo") {
    // drive O2 down and CO2 up over ~10–15 ticks
    demoTick += 1;
    telemetryState.o2_primary_pct = clamp(
      telemetryState.o2_primary_pct - 0.8,
      20,
      100,
    );
    telemetryState.co2_ppm = clamp(telemetryState.co2_ppm + 400, 400, 12000);
  }

  const last_update_ms = Math.round(Math.random() * 50) + 120;
  return { ...telemetryState, last_update_ms };
}

// Alerts state for debouncing and acknowledgements
export type AlertLevel = "caution" | "warning";
export type AlertId = "O2_LOW" | "P_LOW" | "CO2_HIGH" | "BATT_LOW" | "HR_HIGH";

export type ActiveAlert = {
  id: AlertId;
  level: AlertLevel;
  message: string;
  acknowledged?: boolean;
};

// rolling counts for consecutive reads
const consecutive: Record<AlertId, number> = {
  O2_LOW: 0,
  P_LOW: 0,
  CO2_HIGH: 0,
  BATT_LOW: 0,
  HR_HIGH: 0,
};

const acked: Set<AlertId> = new Set();

export function acknowledgeAlert(id: AlertId) {
  acked.add(id);
}

export function clearAcknowledgement(id: AlertId) {
  acked.delete(id);
}

export function resetAcknowledgements() {
  acked.clear();
}

export function evaluateAlerts(t: Telemetry): ActiveAlert[] {
  // Thresholds per spec
  const actives: ActiveAlert[] = [];

  // O2_LOW
  if (t.o2_primary_pct < 48) {
    consecutive.O2_LOW = 2; // immediate warning
    actives.push({
      id: "O2_LOW",
      level: "warning",
      message: `Primary O₂ ${t.o2_primary_pct.toFixed(0)}%, Secondary ${t.o2_secondary_pct.toFixed(0)}%`,
      acknowledged: acked.has("O2_LOW"),
    });
  } else if (t.o2_primary_pct < 55) {
    consecutive.O2_LOW += 1;
    if (consecutive.O2_LOW >= 2) {
      actives.push({
        id: "O2_LOW",
        level: "caution",
        message: `Primary O₂ ${t.o2_primary_pct.toFixed(0)}%, Secondary ${t.o2_secondary_pct.toFixed(0)}%`,
        acknowledged: acked.has("O2_LOW"),
      });
    }
  } else if (t.o2_primary_pct >= 58) {
    consecutive.O2_LOW = 0;
    clearAcknowledgement("O2_LOW");
  } else {
    consecutive.O2_LOW = 0;
  }

  // P_LOW
  if (t.suit_pressure_kpa < 28.5) {
    consecutive.P_LOW = 2;
    actives.push({
      id: "P_LOW",
      level: "warning",
      message: `Suit pressure ${t.suit_pressure_kpa.toFixed(1)} kPa`,
      acknowledged: acked.has("P_LOW"),
    });
  } else if (t.suit_pressure_kpa < 29.6) {
    consecutive.P_LOW += 1;
    if (consecutive.P_LOW >= 2) {
      actives.push({
        id: "P_LOW",
        level: "caution",
        message: `Suit pressure ${t.suit_pressure_kpa.toFixed(1)} kPa`,
        acknowledged: acked.has("P_LOW"),
      });
    }
  } else if (t.suit_pressure_kpa >= 29.6) {
    consecutive.P_LOW = 0;
    clearAcknowledgement("P_LOW");
  }

  // CO2_HIGH
  if (t.co2_ppm > 9000) {
    consecutive.CO2_HIGH = 2;
    actives.push({
      id: "CO2_HIGH",
      level: "warning",
      message: `CO₂ ${t.co2_ppm} ppm`,
      acknowledged: acked.has("CO2_HIGH"),
    });
  } else if (t.co2_ppm > 7000) {
    consecutive.CO2_HIGH += 1;
    if (consecutive.CO2_HIGH >= 2) {
      actives.push({
        id: "CO2_HIGH",
        level: "caution",
        message: `CO₂ ${t.co2_ppm} ppm`,
        acknowledged: acked.has("CO2_HIGH"),
      });
    }
  } else if (t.co2_ppm < 6500) {
    consecutive.CO2_HIGH = 0;
    clearAcknowledgement("CO2_HIGH");
  }

  // BATT_LOW
  if (t.battery_pct <= 15) {
    consecutive.BATT_LOW = 2;
    actives.push({
      id: "BATT_LOW",
      level: "warning",
      message: `Battery ${t.battery_pct}%`,
      acknowledged: acked.has("BATT_LOW"),
    });
  } else if (t.battery_pct <= 25) {
    consecutive.BATT_LOW += 1;
    if (consecutive.BATT_LOW >= 2) {
      actives.push({
        id: "BATT_LOW",
        level: "caution",
        message: `Battery ${t.battery_pct}%`,
        acknowledged: acked.has("BATT_LOW"),
      });
    }
  } else if (t.battery_pct >= 27) {
    consecutive.BATT_LOW = 0;
    clearAcknowledgement("BATT_LOW");
  }

  // HR_HIGH
  if (t.heart_bpm > 140) {
    consecutive.HR_HIGH = 2;
    actives.push({
      id: "HR_HIGH",
      level: "warning",
      message: `Heart rate ${t.heart_bpm} bpm`,
      acknowledged: acked.has("HR_HIGH"),
    });
  } else if (t.heart_bpm > 120) {
    consecutive.HR_HIGH += 1;
    if (consecutive.HR_HIGH >= 2) {
      actives.push({
        id: "HR_HIGH",
        level: "caution",
        message: `Heart rate ${t.heart_bpm} bpm`,
        acknowledged: acked.has("HR_HIGH"),
      });
    }
  } else if (t.heart_bpm < 115) {
    consecutive.HR_HIGH = 0;
    clearAcknowledgement("HR_HIGH");
  }

  return actives;
}

// Timers
const timers = new Map<string, Timer>();

export function startTimer(label: string, seconds: number): string {
  const id = crypto.randomUUID();
  const endsAt = Date.now() + seconds * 1000;
  timers.set(id, { id, label, endsAt });
  return id;
}

export function listTimers(): Timer[] {
  const now = Date.now();
  // drop expired
  for (const [id, t] of timers) {
    if (t.endsAt <= now) timers.delete(id);
  }
  return Array.from(timers.values()).sort((a, b) => a.endsAt - b.endsAt);
}

export function resetDemoState() {
  // Reset telemetry
  telemetryState = { ...initialTelemetry };
  demoTick = 0;
  // Reset alerts debounce and acknowledgements
  consecutive.O2_LOW = 0;
  consecutive.P_LOW = 0;
  consecutive.CO2_HIGH = 0;
  consecutive.BATT_LOW = 0;
  consecutive.HR_HIGH = 0;
  resetAcknowledgements();
  // Clear timers
  timers.clear();
}
