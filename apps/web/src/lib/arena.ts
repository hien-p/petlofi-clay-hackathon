import type { PetState } from "./petPack";

export const ARENA_RUN_SECONDS = 60;
export const ARENA_CUDDLE_COOLDOWN_MS = 900;

export type ArenaOutcome = "victory" | "failed";
export type ArenaRunPhase = "idle" | "running" | "victory" | "failed" | "proof_saved";

export type ArenaRunSnapshot = {
  phase: ArenaRunPhase;
  startedAt: string | null;
  endsAt: string | null;
  timeLeftMs: number;
  score: number;
  safety: number;
  snacksCollected: number;
  enemiesCleared: number;
  hitsTaken: number;
  cuddleReady: boolean;
  specialCharged: boolean;
};

export type ArenaRunSummary = {
  outcome: ArenaOutcome;
  score: number;
  safety: number;
  snacksCollected: number;
  enemiesCleared: number;
  hitsTaken: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  specialUsed: boolean;
  animationStates: PetState[];
};

export type ArenaProofReceipt = {
  kind: "arena-proof";
  identity: string;
  petId: string;
  petName: string;
  lofi?: {
    tokenId: string;
    packId: string;
    packHash?: string;
    status: string;
    sourceUrl?: string;
    spritesheetUrl?: string;
    sourceMode?: string;
    sourceOrigin?: string;
    generationMode?: string;
    sourceImageHash?: string;
  };
  summary: ArenaRunSummary;
  createdAt: string;
};

export function createIdleArenaSnapshot(): ArenaRunSnapshot {
  return {
    phase: "idle",
    startedAt: null,
    endsAt: null,
    timeLeftMs: ARENA_RUN_SECONDS * 1000,
    score: 0,
    safety: 100,
    snacksCollected: 0,
    enemiesCleared: 0,
    hitsTaken: 0,
    cuddleReady: true,
    specialCharged: false
  };
}

export function createArenaRunSnapshot(nowMs: number): ArenaRunSnapshot {
  const startedAt = new Date(nowMs).toISOString();
  const endsAtMs = nowMs + ARENA_RUN_SECONDS * 1000;

  return {
    ...createIdleArenaSnapshot(),
    phase: "running",
    startedAt,
    endsAt: new Date(endsAtMs).toISOString(),
    timeLeftMs: ARENA_RUN_SECONDS * 1000
  };
}

export function tickArenaRun(snapshot: ArenaRunSnapshot, nowMs: number): ArenaRunSnapshot {
  if (snapshot.phase !== "running" || !snapshot.endsAt) {
    return snapshot;
  }

  const timeLeftMs = Math.max(0, new Date(snapshot.endsAt).getTime() - nowMs);
  return {
    ...snapshot,
    timeLeftMs,
    phase: timeLeftMs === 0 ? "victory" : snapshot.phase
  };
}

export function applyArenaSnackPickup(snapshot: ArenaRunSnapshot): ArenaRunSnapshot {
  if (snapshot.phase !== "running") {
    return snapshot;
  }

  return {
    ...snapshot,
    score: snapshot.score + 40,
    safety: clampArenaStat(snapshot.safety + 8),
    snacksCollected: snapshot.snacksCollected + 1
  };
}

export function applyArenaHit(snapshot: ArenaRunSnapshot): ArenaRunSnapshot {
  if (snapshot.phase !== "running") {
    return snapshot;
  }

  const safety = clampArenaStat(snapshot.safety - 12);
  return {
    ...snapshot,
    safety,
    hitsTaken: snapshot.hitsTaken + 1,
    phase: safety <= 0 ? "failed" : snapshot.phase
  };
}

export function applyArenaCuddle(snapshot: ArenaRunSnapshot, enemiesCleared: number): ArenaRunSnapshot {
  if (snapshot.phase !== "running") {
    return snapshot;
  }

  return {
    ...snapshot,
    score: snapshot.score + enemiesCleared * 25 + 10,
    enemiesCleared: snapshot.enemiesCleared + enemiesCleared,
    cuddleReady: false
  };
}

export function completeArenaRun(
  snapshot: ArenaRunSnapshot,
  completedAtMs: number,
  specialUsed: boolean,
  animationStates: PetState[]
): ArenaRunSummary {
  const startedAtMs = snapshot.startedAt ? new Date(snapshot.startedAt).getTime() : completedAtMs;
  const outcome: ArenaOutcome = snapshot.phase === "failed" ? "failed" : "victory";

  return {
    outcome,
    score: snapshot.score,
    safety: snapshot.safety,
    snacksCollected: snapshot.snacksCollected,
    enemiesCleared: snapshot.enemiesCleared,
    hitsTaken: snapshot.hitsTaken,
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    specialUsed,
    animationStates: [...new Set(animationStates)]
  };
}

export function arenaOutcomeAction(outcome: ArenaOutcome): "completed" | "failed" {
  return outcome === "victory" ? "completed" : "failed";
}

function clampArenaStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
