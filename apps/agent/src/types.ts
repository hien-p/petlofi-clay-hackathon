export type AgentAction =
  | "coding"
  | "reviewing"
  | "needs_input"
  | "failed"
  | "completed";

export type PetAnimationState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type PetGameState = {
  level: number;
  xp: number;
  mood: number;
  energy: number;
  streak: number;
  evolutionStage: number;
  latestMemoryBlob?: string;
};

export type AgentStage = {
  action: AgentAction;
  petState: PetAnimationState;
  label: string;
  detail: string;
  at: string;
};

export type MemoryRecord = {
  id: string;
  namespace: string;
  owner: string;
  petId: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export type MemoryRecall = {
  source: "memwal" | "local";
  records: MemoryRecord[];
  summary: string;
};

export type AgentRunInput = {
  prompt: string;
  owner: string;
  petId: string;
  petName: string;
  gameState: PetGameState;
};

export type AgentRunResult = {
  runId: string;
  action: AgentAction;
  petState: PetAnimationState;
  title: string;
  summary: string;
  suggestedMemory: string;
  stages: AgentStage[];
  proof: {
    digest: string;
    createdAt: string;
    promptHash: string;
    memorySummary: string;
  };
  gameDelta: {
    xp: number;
    mood: number;
    energy: number;
    streak: number;
  };
};
