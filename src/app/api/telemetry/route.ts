import { NextRequest } from "next/server";
import { stepTelemetry } from "~/server/demoState";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? undefined;
  const t = stepTelemetry(mode ?? undefined);
  return Response.json(t);
}

