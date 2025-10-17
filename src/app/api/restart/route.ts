import { resetDemoState } from "~/server/demoState";

export const runtime = "nodejs";

export async function POST() {
  resetDemoState();
  return Response.json({ ok: true });
}

