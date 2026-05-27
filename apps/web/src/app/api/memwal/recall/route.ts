import { createMemoryClientFromEnv } from "@petlofi/agent";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const RecallSchema = z.object({
  owner: z.string().min(1),
  petId: z.string().min(1),
  query: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const input = RecallSchema.parse(await request.json());
    const recall = await createMemoryClientFromEnv().recall(input);
    return NextResponse.json({ recall });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Failed to recall memory", { status: 400 });
  }
}
