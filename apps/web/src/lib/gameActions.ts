import type { PetGameState } from "@petlofi/agent";
import type { PetState } from "./petPack";

export type AnimationMeaning = {
  state: PetState;
  title: string;
  useCase: string;
  trigger: string;
};

export const ANIMATION_MEANINGS: AnimationMeaning[] = [
  {
    state: "idle",
    title: "Home and ready",
    useCase: "Owned pet is in the room, rested, and ready for work.",
    trigger: "Rest"
  },
  {
    state: "waiting",
    title: "Needs owner input",
    useCase: "Pet is waiting for wallet approval, user input, a memory, or enough level to evolve.",
    trigger: "Mint, sync, locked evolve"
  },
  {
    state: "running",
    title: "Agent working",
    useCase: "AI agent is actively turning the builder prompt into concrete work.",
    trigger: "Run agent"
  },
  {
    state: "review",
    title: "Checking memory",
    useCase: "Pet is reviewing output, recalling MemWal context, or syncing a memory proof.",
    trigger: "Review, sync memory"
  },
  {
    state: "jumping",
    title: "Proof of work",
    useCase: "Task completed, XP/streak increased, and proof can be written to Walrus/Sui.",
    trigger: "Complete, evolve"
  },
  {
    state: "waving",
    title: "Ready to share",
    useCase: "Pet is ready for the next task or a shareable demo moment.",
    trigger: "Mint, feed"
  },
  {
    state: "failed",
    title: "Blocked run",
    useCase: "Task failed or was blocked; mood and energy drop and streak resets.",
    trigger: "Failed task"
  },
  {
    state: "running-right",
    title: "Move right",
    useCase: "Room movement and drag feedback for the owned companion.",
    trigger: "Move right"
  },
  {
    state: "running-left",
    title: "Move left",
    useCase: "Room movement and drag feedback for the owned companion.",
    trigger: "Move left"
  }
];

export function feedPet(state: PetGameState): PetGameState {
  return {
    ...state,
    mood: clampStat(state.mood + 10),
    energy: clampStat(state.energy + 4)
  };
}

export function restPet(state: PetGameState): PetGameState {
  return {
    ...state,
    mood: clampStat(state.mood + 2),
    energy: clampStat(state.energy + 25)
  };
}

export function nextEvolutionRequiredLevel(state: PetGameState): number {
  return (state.evolutionStage + 1) * 3;
}

export function canEvolvePet(state: PetGameState): boolean {
  return state.level >= nextEvolutionRequiredLevel(state);
}

export function evolvePet(state: PetGameState): PetGameState {
  if (!canEvolvePet(state)) {
    return state;
  }

  return {
    ...state,
    evolutionStage: state.evolutionStage + 1,
    mood: clampStat(state.mood + 12)
  };
}

export function failedLocalRun(state: PetGameState): PetGameState {
  return {
    ...state,
    mood: clampStat(state.mood - 8),
    energy: clampStat(state.energy - 8),
    streak: 0
  };
}

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}
