"use client";

import { useState } from "react";

export function RestartButton() {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    try {
      setBusy(true);
      await fetch("/api/restart", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Restart telemetry and clear timers"
      className="rounded-md border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-sm text-white hover:bg-neutral-800 disabled:opacity-60"
      style={{ backdropFilter: "blur(4px)" }}
    >
      {busy ? "Restarting…" : "Restart"}
    </button>
  );
}

