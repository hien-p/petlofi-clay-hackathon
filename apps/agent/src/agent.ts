import { mapActionToPetState } from "./state.js";
import { createProofId, sha256Hex, stableJson } from "./proof.js";
import type { AgentRunInput, AgentRunResult, AgentStage } from "./types.js";
import { PetLofiMemoryClient } from "./memwal.js";

export async function runPetAgentTask(
  input: AgentRunInput,
  memoryClient = new PetLofiMemoryClient()
): Promise<AgentRunResult> {
  const createdAt = new Date().toISOString();
  const recall = await memoryClient.recall({
    owner: input.owner,
    petId: input.petId,
    query: input.prompt
  });

  const summary = await synthesizeAgentAnswer(input.prompt, input.petName, recall.summary);
  const stages: AgentStage[] = [
    stage("coding", "Reading the task and turning it into concrete work."),
    stage("reviewing", "Checking the output against the pet's remembered context."),
    stage("completed", "Task complete. Pet state can be synced to Sui.")
  ];
  const digestPayload = {
    prompt: input.prompt,
    owner: input.owner,
    petId: input.petId,
    summary,
    recall: recall.summary,
    createdAt
  };
  const promptHash = sha256Hex(input.prompt);
  const digest = sha256Hex(stableJson(digestPayload));

  return {
    runId: createProofId("run"),
    action: "completed",
    petState: mapActionToPetState("completed"),
    title: `PetLofi agent run for ${input.petName}`,
    summary,
    suggestedMemory: `For ${input.petName}: ${summary}`,
    stages,
    proof: {
      digest,
      createdAt,
      promptHash,
      memorySummary: recall.summary
    },
    gameDelta: {
      xp: 24,
      mood: 8,
      energy: -12,
      streak: 1
    }
  };
}

function stage(action: AgentStage["action"], detail: string): AgentStage {
  return {
    action,
    petState: mapActionToPetState(action),
    label: action.replace("_", " "),
    detail,
    at: new Date().toISOString()
  };
}

async function synthesizeAgentAnswer(prompt: string, petName: string, memorySummary: string): Promise<string> {
  const keyTerms = prompt
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter((word) => word.length > 4)
    .slice(0, 6);

  const memoryLine = memorySummary.startsWith("No prior") ? "This is the first remembered run for this pet." : `Relevant memory: ${memorySummary}`;

  return [
    `${petName} worked through the task and produced a concrete next step.`,
    keyTerms.length ? `Focus terms: ${keyTerms.join(", ")}.` : "The prompt was short, so the agent kept the answer action-oriented.",
    memoryLine,
    "Recommended next step: sync the digest to Walrus, then record the action on Sui so the pet's XP, mood, and streak stay canonical."
  ].join(" ");
}
