import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/JPY", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Exchange provider returned ${response.status}`);

    const data = await response.json();
    const rate = data?.rates?.IDR;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Exchange provider returned an invalid rate");

    const now = new Date().toISOString();
    return NextResponse.json({
      id: "JPY_IDR",
      base: "JPY",
      quote: "IDR",
      rate,
      source: "open.er-api.com/v6/latest/JPY",
      fetchedAt: now,
      cachedAt: now,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Exchange rate unavailable" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
