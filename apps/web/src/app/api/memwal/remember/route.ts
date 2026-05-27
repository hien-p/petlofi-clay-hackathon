import { createMemoryClientFromEnv } from "@petlofi/agent";
import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadWalrusProof } from "@/lib/walrus";

export const runtime = "nodejs";

const RememberSchema = z.object({
  owner: z.string().min(1),
  petId: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const input = RememberSchema.parse(await request.json());
    const client = createMemoryClientFromEnv();
    const record = await client.remember(input);
    const walrus = await uploadWalrusProof({
      kind: "memory-proof",
      payload: record
    });

    return NextResponse.json({ record, walrus });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Failed to save memory", { status: 400 });
  }
}
