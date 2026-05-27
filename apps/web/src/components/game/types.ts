import type { PetState } from "@/lib/petPack";
import type { ArenaRunSnapshot, ArenaRunSummary } from "@/lib/arena";

export type GameSceneId = "arena" | "village";

export type GameHotspotId =
  | "suins-gate"
  | "agent-forge"
  | "walrus-vault"
  | "memwal-library"
  | "rest-hut"
  | "feed-stall"
  | "petdex";

export type GameCommand =
  | { type: "cuddle" }
  | { type: "startArenaRun" }
  | { type: "resetArenaRun" }
  | { type: "chargeAgentSpecial" }
  | { type: "setPetVariant"; variant: GamePetVariant | null }
  | { type: "setPetAtlas"; atlas: GamePetAtlas | null }
  | { type: "setPetState"; petState: PetState }
  | { type: "move"; dx: number; dy: number }
  | { type: "setMoveVector"; dx: number; dy: number }
  | { type: "goToZone"; zoneId: GameHotspotId }
  | { type: "setScene"; scene: GameSceneId }
  | { type: "syncMap"; friends: GameFriend[]; mapRevision: number };

export type GameFriend = {
  id: string;
  name: string;
  role: string;
  zoneId: GameHotspotId;
  color: string;
  petState?: PetState;
  x?: number;
  y?: number;
};

export type GameCallbacks = {
  onZoneChange?: (zoneId: GameHotspotId) => void;
  onAction?: (action: string) => void;
  onPetStateChange?: (petState: PetState) => void;
  onCuddleAttack?: () => void;
  onArenaTick?: (snapshot: ArenaRunSnapshot) => void;
  onArenaComplete?: (summary: ArenaRunSummary) => void;
};

export type GamePetVariant = {
  id: string;
  name: string;
  tintHex: number;
  accentHex: number;
};

export type GamePetAtlas = {
  textureKey: string;
  spritesheetUrl: string;
  petJsonUrl: string;
};

export type GameCanvasProps = GameCallbacks & {
  scene: GameSceneId;
  petState: PetState;
  petVariant?: GamePetVariant | null;
  petAtlas?: GamePetAtlas | null;
  activeZone?: GameHotspotId;
  friends: GameFriend[];
  mapRevision: number;
  command?: GameCommand;
  commandNonce: number;
};
