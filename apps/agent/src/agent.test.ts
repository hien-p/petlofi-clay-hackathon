import { describe, expect, it } from "vitest";
import { applyAgentDelta, mapActionToPetState } from "./state.js";
import { runPetAgentTask } from "./agent.js";
import { PetLofiMemoryClient } from "./memwal.js";

describe("PetLofi agent runtime", () => {
  it("maps agent actions to Codex pet animation states", () => {
    expect(mapActionToPetState("coding")).toBe("running");
    expect(mapActionToPetState("reviewing")).toBe("review");
    expect(mapActionToPetState("needs_input")).toBe("waiting");
    expect(mapActionToPetState("failed")).toBe("failed");
    expect(mapActionToPetState("completed")).toBe("jumping");
  });

  it("applies game deltas without leaving valid stat bounds", () => {
    const next = applyAgentDelta(
      { level: 1, xp: 90, mood: 96, energy: 4, streak: 0, evolutionStage: 0 },
      { xp: 24, mood: 8, energy: -12, streak: 1 }
    );

    expect(next.level).toBe(2);
    expect(next.mood).toBe(100);
    expect(next.energy).toBe(0);
    expect(next.streak).toBe(1);
  });

  it("creates a verifiable task proof", async () => {
    const memoryClient = new PetLofiMemoryClient({ dataDir: "/tmp/petlofi-agent-test" });
    const result = await runPetAgentTask(
      {
        prompt: "Review the hackathon demo flow",
        owner: "0xabc",
        petId: "pet-1",
        petName: "LoFi",
        gameState: { level: 1, xp: 0, mood: 80, energy: 80, streak: 0, evolutionStage: 0 }
      },
      memoryClient
    );

    expect(result.runId).toMatch(/^run_/);
    expect(result.proof.digest).toHaveLength(64);
    expect(result.stages.map((stage) => stage.petState)).toEqual(["running", "review", "jumping"]);
  });
});
