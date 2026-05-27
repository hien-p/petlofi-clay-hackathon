import type { AgentAction, PetAnimationState, PetGameState } from "./types.js";

export const ACTION_TO_PET_STATE: Record<AgentAction, PetAnimationState> = {
  coding: "running",
  reviewing: "review",
  needs_input: "waiting",
  failed: "failed",
  completed: "jumping"
};

export function mapActionToPetState(action: AgentAction): PetAnimationState {
  return ACTION_TO_PET_STATE[action];
}

export function applyAgentDelta(state: PetGameState, delta: { xp: number; mood: number; energy: number; streak: number }): PetGameState {
  const nextXp = Math.max(0, state.xp + delta.xp);
  const level = Math.max(state.level, Math.floor(nextXp / 100) + 1);

  return {
    ...state,
    xp: nextXp,
    level,
    mood: clamp(state.mood + delta.mood, 0, 100),
    energy: clamp(state.energy + delta.energy, 0, 100),
    streak: Math.max(0, state.streak + delta.streak),
    evolutionStage: Math.max(state.evolutionStage, Math.min(5, Math.floor(level / 3)))
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
