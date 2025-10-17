import { listTimers } from "~/server/demoState";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ timers: listTimers() });
}

