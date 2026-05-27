import { applyAgentDelta, createMemoryClientFromEnv, runPetAgentTask } from "@petlofi/agent";
import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadWalrusProof } from "@/lib/walrus";

export const runtime = "nodejs";

const GameStateSchema = z.object({
  level: z.number(),
  xp: z.number(),
  mood: z.number(),
  energy: z.number(),
  streak: z.number(),
  evolutionStage: z.number(),
  latestMemoryBlob: z.string().optional()
});

const AgentRunSchema = z.object({
  prompt: z.string().min(3),
  owner: z.string().min(1),
  petId: z.string().min(1),
  petName: z.string().min(1),
  gameState: GameStateSchema
});

export async function POST(request: Request) {
  try {
    const input = AgentRunSchema.parse(await request.json());
    const result = await runPetAgentTask(input, createMemoryClientFromEnv());
    const gameState = applyAgentDelta(input.gameState, result.gameDelta);
    const walrus = await uploadWalrusProof({
      kind: "agent-proof",
      payload: {
        runId: result.runId,
        owner: input.owner,
        petId: input.petId,
        proof: result.proof,
        summary: result.summary,
        gameDelta: result.gameDelta
      }
    });

    return NextResponse.json({ result, gameState, walrus });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Failed to run agent", { status: 400 });
  }
}
