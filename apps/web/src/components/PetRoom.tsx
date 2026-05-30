"use client";

import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronUp,
  Coins,
  Cookie,
  Download,
  Eye,
  EyeOff,
  Gamepad2,
  Heart,
  HelpCircle,
  Link as LinkIcon,
  Moon,
  Navigation,
  Palette,
  Sparkles,
  Star,
  Upload,
  Volume2,
  VolumeX,
  X,
  Zap
} from "lucide-react";
import Link from "next/link";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { explorerObjectUrl, explorerTxUrl, faucetUrl } from "@/lib/explorer";
import type { Transaction } from "@mysten/sui/transactions";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRunResult, PetGameState } from "@petlofi/agent";
import {
  ARENA_CUDDLE_COOLDOWN_MS,
  ARENA_RUN_SECONDS,
  arenaOutcomeAction,
  createIdleArenaSnapshot,
  type ArenaProofReceipt,
  type ArenaRunPhase,
  type ArenaRunSnapshot,
  type ArenaRunSummary
} from "@/lib/arena";
import {
  ANIMATION_MEANINGS,
  canEvolvePet,
  nextEvolutionRequiredLevel,
  type AnimationMeaning
} from "@/lib/gameActions";
import { getPublicConfig, isOnChainConfigured } from "@/lib/config";
import {
  buildEvolveTransaction,
  buildFeedTransaction,
  buildMintPetTransaction,
  buildRecordActionTransaction,
  buildRestTransaction,
  buildSyncMemoryTransaction
} from "@/lib/transactions";
import {
  isRealGeneratedPack,
  type LofiGeneratedPetPack,
  type LofiGeneratedResponse
} from "@/lib/lofiGenerated";
import {
  DEFAULT_ANIMATION_MINT_FEE_SUI,
  LOFI_TRADEPORT_URL,
  buildLofiAnimationVariant,
  buildUniqueLofiAnimationVariants,
  shortObjectId,
  type LofiAnimationVariant,
  type TradeportLofiItem,
  type TradeportLofiTopResponse
} from "@/lib/lofiMarket";
import { isSfxMuted, playSfx, setSfxMuted } from "@/lib/sfx";
import type { PetState } from "@/lib/petPack";
import {
  buildNameQuests,
  identityDisplayName,
  normalizeSuiName,
  shortAddress,
  type SuiIdentity
} from "@/lib/suins";
import { PetSprite } from "./PetSprite";
import { GameCanvas } from "./game/GameCanvas";
import type { GameCommand, GameFriend, GameHotspotId, GamePetAtlas, GamePetVariant, GameSceneId } from "./game/types";

type ProofEntry = {
  label: string;
  value: string;
};

type TimelineEntry = {
  petState: PetState;
  label: string;
  detail: string;
};

type MessengerEntry = {
  speaker: string;
  message: string;
};

type OwnedLofiNft = {
  objectId: string;
  type: string;
  name: string;
  description: string;
  imageUrl: string;
  source: "wallet" | "demo";
};

type HeldDirection = "up" | "down" | "left" | "right";

type VillageZoneId = GameHotspotId;

type VillageZone = {
  id: VillageZoneId;
  title: string;
  label: string;
  detail: string;
  action: string;
  kind: "name" | "forge" | "vault" | "library" | "rest" | "feed" | "gallery";
  size: "small" | "medium" | "large";
  x: number;
  y: number;
};

type AgentRunResponse = {
  result: AgentRunResult;
  gameState: PetGameState;
  walrus: {
    blobId: string;
    network: string;
    proofUrl: string;
    digest: string;
    storage: "walrus" | "local";
  };
};

type PetPackUploadResponse = {
  blobId: string;
  proofUrl: string;
  storage: "walrus" | "local";
  pet: {
    id: string;
    displayName: string;
  };
};

type MemorySaveResponse = {
  record: {
    id: string;
    createdAt: string;
  };
  walrus: {
    blobId: string;
    storage: string;
  };
};

type ArenaProofResponse = {
  blobId: string;
  network: string;
  proofUrl: string;
  digest: string;
  storage: "walrus" | "local";
};

type LocalGameAction = "feed" | "rest" | "move-left" | "move-right" | "blocked" | "evolve" | "equip-suins";
type WorldMode = GameSceneId;
type SuiObjectScanner = {
  getOwnedObjects: (input: {
    owner: string;
    cursor?: string | null;
    limit: number;
    options: {
      showContent: boolean;
      showDisplay: boolean;
      showType: boolean;
    };
  }) => Promise<{
    data: unknown[];
    hasNextPage: boolean;
    nextCursor?: string | null;
  }>;
};

const DEFAULT_GAME_STATE: PetGameState = {
  level: 1,
  xp: 0,
  mood: 82,
  energy: 76,
  streak: 0,
  evolutionStage: 0
};

type AvatarPreset = { id: string; name: string; tintHex: number; accentHex: number };

const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "mint", name: "Mint", tintHex: 0x6ee7b7, accentHex: 0x34d399 },
  { id: "lava", name: "Lava", tintHex: 0xff6b3d, accentHex: 0xffd166 },
  { id: "galaxy", name: "Galaxy", tintHex: 0x8b5cf6, accentHex: 0x22d3ee },
  { id: "gold", name: "Gold", tintHex: 0xf4c430, accentHex: 0xffe9a8 },
  { id: "shadow", name: "Shadow", tintHex: 0x475569, accentHex: 0x94a3b8 },
  { id: "bubblegum", name: "Bubblegum", tintHex: 0xff7ac6, accentHex: 0xffc2e2 }
];

function hexNumberToCss(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

const starterTimeline: TimelineEntry[] = [
  { petState: "idle", label: "Template ready", detail: "CLAY Lofi Yeti is home, owned by nobody yet, and ready to be minted." }
];

const AGENT_STAGE_LABELS: Record<string, string> = {
  coding: "Agent working",
  reviewing: "Memory review",
  completed: "Proof complete"
};

const LOCAL_IDENTITY: SuiIdentity = {
  status: "local",
  address: "local-demo-owner",
  displayName: "@clay-builder",
  suinsName: null,
  balanceMist: null,
  ownedObjectCount: null
};

const STARTER_MESSAGES: MessengerEntry[] = [
  { speaker: "PetLofi", message: "SuiNS Companion Mode ready. Your name becomes the builder identity; the pet carries the receipts." },
  { speaker: "CLAY Lofi Yeti", message: "Mint me, equip me to your SuiNS identity, then run work so I can grow." }
];

const STARTER_FRIENDS: GameFriend[] = [
  { id: "clay-runner", name: "@clay-runner", role: "proof", zoneId: "agent-forge", color: "#f4c95d", petState: "running" },
  { id: "walrus-keeper", name: "@walrus-keeper", role: "vault", zoneId: "walrus-vault", color: "#4edbd2", petState: "review" },
  { id: "memwal-sage", name: "@memwal-sage", role: "recall", zoneId: "memwal-library", color: "#a99cff", petState: "review" },
  { id: "sui-forger", name: "@sui-forger", role: "agent", zoneId: "suins-gate", color: "#93f5c8", petState: "waving" }
];

const FRIEND_POOL: GameFriend[] = [
  { id: "lofi-builder", name: "@lofi-builder", role: "new plot", zoneId: "feed-stall", color: "#ff6b8d", petState: "waving" },
  { id: "deepbook-pal", name: "@deepbook-pal", role: "market", zoneId: "agent-forge", color: "#f4c95d", petState: "running-right" },
  { id: "suins-mapper", name: "@suins-mapper", role: "name", zoneId: "suins-gate", color: "#4edbd2", petState: "idle" },
  { id: "walrus-friend", name: "@walrus-friend", role: "blob", zoneId: "walrus-vault", color: "#a99cff", petState: "jumping" },
  { id: "memwal-pal", name: "@memwal-pal", role: "memory", zoneId: "memwal-library", color: "#93f5c8", petState: "review" }
];

const DEMO_LOFI_NFTS: OwnedLofiNft[] = [
  {
    objectId: "template:clay-lofi-yeti",
    type: "demo::lofi::CLAYYeti",
    name: "CLAY Lofi Yeti",
    description: "Default animated PetLofi companion rig for local proof mode.",
    imageUrl: "/pets/lofi-yeti/source-logo.png",
    source: "demo"
  },
  {
    objectId: "template:walrus-lofi-yeti",
    type: "demo::lofi::WalrusYeti",
    name: "Walrus Vault Yeti",
    description: "Demo Lofi skin placeholder. Real wallet NFTs appear here after connect.",
    imageUrl: "/pets/lofi-yeti/source-logo.png",
    source: "demo"
  },
  {
    objectId: "template:memwal-lofi-yeti",
    type: "demo::lofi::MemWalYeti",
    name: "MemWal Recall Yeti",
    description: "Demo Lofi skin placeholder for memory-focused companions.",
    imageUrl: "/pets/lofi-yeti/source-logo.png",
    source: "demo"
  }
];

const LOFI_NFT_KEYWORDS = ["lofi", "yeti", "clay"];
const LOFI_NFT_TYPE_FILTERS = (process.env.NEXT_PUBLIC_LOFI_NFT_TYPE_FILTERS ?? "")
  .split(",")
  .map((filter) => filter.trim().toLowerCase())
  .filter(Boolean);
const OWNED_OBJECT_PAGE_LIMIT = 50;
const OWNED_OBJECT_MAX_PAGES = 8;

const VILLAGE_ZONES: VillageZone[] = [
  {
    id: "suins-gate",
    title: "SuiNS Gate",
    label: "Name",
    detail: "Resolve identity, mint the pet, equip companion, or try evolve.",
    action: "Mint / Equip / Evolve",
    kind: "name",
    size: "large",
    x: 30,
    y: 45
  },
  {
    id: "agent-forge",
    title: "Agent Forge",
    label: "Work",
    detail: "Run the AI agent and earn proof-of-work progress.",
    action: "Run agent",
    kind: "forge",
    size: "large",
    x: 66,
    y: 40
  },
  {
    id: "walrus-vault",
    title: "Walrus Vault",
    label: "Proof",
    detail: "Sync the latest proof or memory blob into the passport.",
    action: "Sync proof",
    kind: "vault",
    size: "medium",
    x: 71,
    y: 74
  },
  {
    id: "memwal-library",
    title: "MemWal Library",
    label: "Memory",
    detail: "Save the latest useful work summary as pet memory.",
    action: "Save memory",
    kind: "library",
    size: "medium",
    x: 34,
    y: 94
  },
  {
    id: "rest-hut",
    title: "Rest Hut",
    label: "Rest",
    detail: "Restore energy and return to the idle home state.",
    action: "Rest",
    kind: "rest",
    size: "small",
    x: 22,
    y: 78
  },
  {
    id: "feed-stall",
    title: "Treat Stall",
    label: "Feed",
    detail: "Feed the pet to improve mood and readiness.",
    action: "Feed",
    kind: "feed",
    size: "small",
    x: 51,
    y: 58
  },
  {
    id: "petdex",
    title: "Petdex Gallery",
    label: "Gallery",
    detail: "Inspect owned pet, templates, and Codex pack.",
    action: "Open Petdex",
    kind: "gallery",
    size: "medium",
    x: 76,
    y: 94
  }
];

export function PetRoom() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const heldDirectionsRef = useRef<Set<HeldDirection>>(new Set());
  const dpadPressStartedAtRef = useRef<Record<HeldDirection, number>>({
    up: 0,
    down: 0,
    left: 0,
    right: 0
  });
  const [petState, setPetState] = useState<PetState>("idle");
  const [gameState, setGameState] = useState<PetGameState>(DEFAULT_GAME_STATE);
  const [prompt, setPrompt] = useState("Review the PetLofi CLAY demo and produce the next concrete shipping step.");
  const [petId, setPetId] = useState("template:lofi-yeti");
  const [petName, setPetName] = useState("CLAY Lofi Yeti");
  const [isMinted, setIsMinted] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentRunResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(starterTimeline);
  const [activeStage, setActiveStage] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [proofs, setProofs] = useState<ProofEntry[]>([
    { label: "Owner update rule", value: "Only the owner can update this pet" },
    { label: "Lofi pet art", value: "CLAY Lofi Yeti hatch-pet 8x9 reference-style atlas" },
    { label: "Reference", value: "https://hackathon.lofitheyeti.com/" },
    { label: "Sui mode", value: isOnChainConfigured() ? `Sui testnet: ${shortObjectId(getPublicConfig().packageId)}` : "On-chain package not configured" },
    { label: "Identity mode", value: "SuiNS Companion Mode" },
    { label: "Latest animation state", value: "idle" }
  ]);
  const [mintMessage, setMintMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [memoryMessage, setMemoryMessage] = useState("");
  const [gameActionMessage, setGameActionMessage] = useState("");
  const [identity, setIdentity] = useState<SuiIdentity>(LOCAL_IDENTITY);
  const [isNameEquipped, setIsNameEquipped] = useState(false);
  const [latestWalrusBlob, setLatestWalrusBlob] = useState("");
  const [messengerMessages, setMessengerMessages] = useState<MessengerEntry[]>(STARTER_MESSAGES);
  const [activeVillageZoneId, setActiveVillageZoneId] = useState<VillageZoneId>("suins-gate");
  const [isPetdexOpen, setIsPetdexOpen] = useState(false);
  const [showHud, setShowHud] = useState(false);
  const [lastTx, setLastTx] = useState<{ label: string; digest: string } | null>(null);
  const [lastObject, setLastObject] = useState<string | null>(null);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sfxMuted, setSfxMutedState] = useState(false);
  const [showVillageGuide, setShowVillageGuide] = useState(false);
  const [activeAvatarPresetId, setActiveAvatarPresetId] = useState<string | null>(null);
  const arenaSfxPhaseRef = useRef<string | null>(null);
  const [arenaExpanded, setArenaExpanded] = useState(false);
  const [careCollapsed, setCareCollapsed] = useState(true);
  const arenaAutoSavedRef = useRef(false);
  const [worldMode, setWorldMode] = useState<WorldMode>("village");
  const [gameCommand, setGameCommand] = useState<GameCommand>();
  const [gameCommandNonce, setGameCommandNonce] = useState(0);
  const [mapFriends, setMapFriends] = useState<GameFriend[]>(STARTER_FRIENDS);
  const [mapRevision, setMapRevision] = useState(1);
  const [ownedLofiNfts, setOwnedLofiNfts] = useState<OwnedLofiNft[]>(DEMO_LOFI_NFTS);
  const [isLoadingLofiNfts, setIsLoadingLofiNfts] = useState(false);
  const [scanAddressInput, setScanAddressInput] = useState("");
  const [lastScannedAddress, setLastScannedAddress] = useState("");
  const [scanError, setScanError] = useState("");
  const [lofiMarket, setLofiMarket] = useState<TradeportLofiTopResponse | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketMode, setMarketMode] = useState<"price" | "rarity">("price");
  const [activeLofiSource, setActiveLofiSource] = useState<TradeportLofiItem | null>(null);
  const [lofiAnimationRoster, setLofiAnimationRoster] = useState<LofiAnimationVariant[]>([]);
  const [activeLofiVariant, setActiveLofiVariant] = useState<LofiAnimationVariant | null>(null);
  const [lofiGeneratedPacks, setLofiGeneratedPacks] = useState<LofiGeneratedPetPack[]>([]);
  const [activeGeneratedPack, setActiveGeneratedPack] = useState<LofiGeneratedPetPack | null>(null);
  const [isGeneratingLofiPacks, setIsGeneratingLofiPacks] = useState(false);
  const [generatedPackError, setGeneratedPackError] = useState("");
  const [arenaSnapshot, setArenaSnapshot] = useState<ArenaRunSnapshot>(() => createIdleArenaSnapshot());
  const [arenaSummary, setArenaSummary] = useState<ArenaRunSummary | null>(null);
  const [isSavingArenaProof, setIsSavingArenaProof] = useState(false);
  const [arenaProofMessage, setArenaProofMessage] = useState("");

  const owner = account?.address ?? "local-demo-owner";
  const activeIdentity = identityDisplayName(owner, identity.suinsName);
  const activeVillageZone = VILLAGE_ZONES.find((zone) => zone.id === activeVillageZoneId) ?? VILLAGE_ZONES[0];
  const activeAnimationMeaning = ANIMATION_MEANINGS.find((meaning) => meaning.state === petState) ?? ANIMATION_MEANINGS[0];
  const progress = useMemo(() => Math.min(100, gameState.xp % 100), [gameState.xp]);
  const evolutionRequiredLevel = nextEvolutionRequiredLevel(gameState);
  const petNeed = !isMinted
    ? account?.address
      ? { mood: "Mint me to begin!", hint: "Tap “Mint to begin” to bring me on-chain — then you can Feed & Rest me." }
      : { mood: "Mint me to begin!", hint: "Connect a wallet, then tap “Mint to begin”." }
    : gameState.energy < 30
    ? { mood: "I'm exhausted 😴", hint: "Energy low — tap Rest." }
    : gameState.mood < 40
    ? { mood: "I'm hungry 🍖", hint: "Mood low — tap Feed." }
    : canEvolvePet(gameState)
    ? { mood: "I'm ready to evolve! ✦", hint: "Tap Evolve to grow." }
    : { mood: "Ready to work! ✦", hint: "Put me to work or go Play." };
  const nameQuests = useMemo(
    () =>
      buildNameQuests({
        hasWallet: Boolean(account?.address),
        hasSuiName: Boolean(identity.suinsName),
        isEquipped: isNameEquipped,
        isMinted,
        hasAgentRun: Boolean(agentResult && agentResult.action !== "failed"),
        hasMemory: Boolean(gameState.latestMemoryBlob),
        hasWalrusProof: Boolean(latestWalrusBlob),
        hasEvolution: gameState.evolutionStage > 0
      }),
    [account?.address, agentResult, gameState.evolutionStage, gameState.latestMemoryBlob, identity.suinsName, isMinted, isNameEquipped, latestWalrusBlob]
  );
  const completedQuestCount = nameQuests.filter((quest) => quest.complete).length;
  const onlineCount = 1 + mapFriends.length + Number(Boolean(account?.address));
  const walletLofiCount = ownedLofiNfts.filter((nft) => nft.source === "wallet").length;
  const selectedMarketItems = marketMode === "price" ? lofiMarket?.mostExpensive ?? [] : lofiMarket?.rarest ?? [];
  const animationMintFeeSui = lofiMarket?.animationMintFeeSui ?? DEFAULT_ANIMATION_MINT_FEE_SUI;
  const activeGamePetVariant: GamePetVariant | null = useMemo(
    () =>
      activeLofiVariant && !activeGeneratedPack
        ? {
            id: activeLofiVariant.id,
            name: activeLofiVariant.name,
            tintHex: activeLofiVariant.tintHex,
            accentHex: activeLofiVariant.accentHex
          }
        : null,
    [activeGeneratedPack, activeLofiVariant]
  );
  const activeGamePetAtlas: GamePetAtlas | null = useMemo(
    () =>
      activeGeneratedPack?.status === "ready"
        ? {
            textureKey: `generated-${activeGeneratedPack.packId}`,
            spritesheetUrl: activeGeneratedPack.spritesheetUrl,
            petJsonUrl: activeGeneratedPack.petJsonUrl
          }
        : null,
    [activeGeneratedPack]
  );
  const arenaSecondsLeft = Math.ceil(arenaSnapshot.timeLeftMs / 1000);
  const arenaRunLabel: Record<ArenaRunPhase, string> = {
    idle: "Ready",
    running: "Survive",
    victory: "Victory",
    failed: "Failed",
    proof_saved: "Proof saved"
  };

  useEffect(() => {
    setSfxMutedState(isSfxMuted());
    if (typeof window !== "undefined") {
      try {
        setShowVillageGuide(window.localStorage.getItem("petlofi_village_guide") !== "dismissed");
      } catch {
        setShowVillageGuide(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!account?.address) {
      setIdentity(LOCAL_IDENTITY);
      setIsNameEquipped(false);
      setOwnedLofiNfts(DEMO_LOFI_NFTS);
      setIsLoadingLofiNfts(false);
      setLastScannedAddress("");
      setScanError("");
      return;
    }

    let cancelled = false;
    const address = account.address;
    setIsLoadingLofiNfts(true);
    setScanAddressInput(address);
    setLastScannedAddress(address);
    setScanError("");
    setIdentity({
      status: "loading",
      address,
      displayName: shortAddress(address),
      suinsName: null,
      balanceMist: null,
      ownedObjectCount: null
    });
    setIsNameEquipped(false);

    async function loadIdentity() {
      const [namesResult, balanceResult, objectsResult] = await Promise.allSettled([
        suiClient.resolveNameServiceNames({ address, limit: 1, format: "at" }),
        suiClient.getBalance({ owner: address }),
        loadOwnedLofiObjects(suiClient, address)
      ]);

      if (cancelled) {
        return;
      }

      const suinsName =
        namesResult.status === "fulfilled" ? normalizeSuiName(namesResult.value.data[0] ?? null) : null;
      const balanceMist = balanceResult.status === "fulfilled" ? balanceResult.value.totalBalance : null;
      const ownedObjectCount = objectsResult.status === "fulfilled" ? objectsResult.value.objectCount : null;
      const lofiNfts = objectsResult.status === "fulfilled" ? objectsResult.value.lofiNfts : [];
      const lookupError =
        namesResult.status === "rejected" ? namesResult.reason instanceof Error ? namesResult.reason.message : "SuiNS lookup unavailable" : undefined;

      setIdentity({
        status: lookupError ? "error" : suinsName ? "resolved" : "no-name",
        address,
        displayName: identityDisplayName(address, suinsName),
        suinsName,
        balanceMist,
        ownedObjectCount,
        error: lookupError
      });
      setOwnedLofiNfts(lofiNfts);
      setIsLoadingLofiNfts(false);
      setLastScannedAddress(address);
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [account?.address, suiClient]);

  useEffect(() => {
    function keyToDirection(key: string): HeldDirection | null {
      switch (key.toLowerCase()) {
        case "arrowleft":
        case "a":
          return "left";
        case "arrowright":
        case "d":
          return "right";
        case "arrowup":
        case "w":
          return "up";
        case "arrowdown":
        case "s":
          return "down";
        default:
          return null;
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      const direction = keyToDirection(event.key);
      if (direction) {
        event.preventDefault();
        // Ignore auto-repeat; only mark the press start on the first keydown so a
        // quick tap can resolve to a single step on keyup.
        if (!heldDirectionsRef.current.has(direction)) {
          dpadPressStartedAtRef.current[direction] = window.performance.now();
          startHeldMove(direction);
        }
        return;
      }

      if (event.key === "Enter" && worldMode === "arena" && arenaSnapshot.phase !== "running") {
        event.preventDefault();
        startArenaRun();
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        void interactWithVillageZone(activeVillageZone);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const direction = keyToDirection(event.key);
      if (!direction) {
        return;
      }

      const startedAt = dpadPressStartedAtRef.current[direction];
      dpadPressStartedAtRef.current[direction] = 0;
      stopHeldMove(direction);

      // Short tap → nudge a single step instead of doing nothing.
      if (startedAt && window.performance.now() - startedAt < 145) {
        const delta = dpadDelta(direction);
        movePetBy(delta.x, delta.y);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopAllHeldMoves);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopAllHeldMoves);
    };
  });

  useEffect(() => {
    if (!isPetdexOpen || lofiMarket || isLoadingMarket) {
      return;
    }

    void loadTradeportTopLofi(false);
  }, [isPetdexOpen, lofiMarket, isLoadingMarket]);

  // Auto-save the run proof to Walrus when an arena run ends (no wallet needed).
  useEffect(() => {
    if (arenaSfxPhaseRef.current !== arenaSnapshot.phase) {
      arenaSfxPhaseRef.current = arenaSnapshot.phase;
      if (arenaSnapshot.phase === "victory") {
        playSfx("victory");
      } else if (arenaSnapshot.phase === "failed") {
        playSfx("fail");
      }
    }
    if (arenaSnapshot.phase === "running" || arenaSnapshot.phase === "idle") {
      arenaAutoSavedRef.current = false;
      return;
    }
    if (
      (arenaSnapshot.phase === "victory" || arenaSnapshot.phase === "failed") &&
      arenaSummary &&
      !isSavingArenaProof &&
      !arenaAutoSavedRef.current
    ) {
      arenaAutoSavedRef.current = true;
      void saveArenaProof();
    }
  }, [arenaSnapshot.phase, arenaSummary, isSavingArenaProof]);

  const addProofEntries = (entries: ProofEntry[]) => {
    setProofs((current) => mergeProofEntries(current, entries));
  };

  const pushMessengerMessage = (speaker: string, message: string) => {
    setMessengerMessages((current) => [{ speaker, message }, ...current].slice(0, 8));
  };

  const setSingleTimeline = (entry: TimelineEntry) => {
    setTimeline([entry]);
    setActiveStage(0);
  };

  function sendGameCommand(command: GameCommand) {
    setGameCommand(command);
    setGameCommandNonce((current) => current + 1);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.localStorage.getItem("petlofi_onboarded")) {
      setShowOnboarding(true);
    }
  }, []);

  async function runGuidedDemo() {
    if (isDemoPlaying) {
      return;
    }
    setIsDemoPlaying(true);
    try {
      pushMessengerMessage("Demo", "No wallet needed — here's your on-chain pet.");
      setShowHud(true);
      setWorldMode("village");
      await wait(900);
      sendGameCommand({ type: "setPetState", petState: "waving" });
      await wait(800);
      setWorldMode("village");
      try {
        await executeAgentRun();
      } catch {
        // off-chain demo run failed; keep the tour going
      }
      await wait(700);
      setWorldMode("arena");
      await wait(900);
      sendGameCommand({ type: "startArenaRun" });
      await wait(2200);
      sendGameCommand({ type: "chargeAgentSpecial" });
      await wait(500);
      sendGameCommand({ type: "cuddle" });
      await wait(1200);
      pushMessengerMessage("Demo", "That pet, its stats, and proofs live on Sui. Connect a wallet to mint it for real.");
      setGameActionMessage("Demo complete — connect your wallet to mint & play on-chain.");
    } finally {
      setIsDemoPlaying(false);
    }
  }

  async function executeTx(tx: Transaction) {
    return signAndExecute({ transaction: tx });
  }

  async function refreshPetStats(petObjectId: string) {
    try {
      const object = await suiClient.getObject({ id: petObjectId, options: { showContent: true } });
      const content = object.data?.content;
      if (!content || content.dataType !== "moveObject") {
        return;
      }

      const fields = content.fields as unknown as Record<string, unknown>;
      const toNumber = (value: unknown): number => {
        if (typeof value === "number") {
          return value;
        }
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const memoryBytes = fields.latest_memory_blob;
      let latestMemoryBlob: string | undefined;
      if (Array.isArray(memoryBytes) && memoryBytes.length > 0) {
        try {
          latestMemoryBlob = new TextDecoder().decode(Uint8Array.from(memoryBytes as number[]));
        } catch {
          latestMemoryBlob = undefined;
        }
      }

      setGameState((current) => ({
        ...current,
        level: toNumber(fields.level),
        xp: toNumber(fields.xp),
        mood: toNumber(fields.mood),
        energy: toNumber(fields.energy),
        streak: toNumber(fields.streak),
        evolutionStage: toNumber(fields.evolution_stage),
        latestMemoryBlob: latestMemoryBlob ?? current.latestMemoryBlob
      }));
    } catch {
      // keep current state on failure
    }
  }

  function extractMintedPetId(result: { objectChanges?: unknown }): string | null {
    const changes = result.objectChanges;
    if (!Array.isArray(changes)) {
      return null;
    }
    for (const change of changes) {
      if (
        change &&
        typeof change === "object" &&
        (change as { type?: string }).type === "created" &&
        typeof (change as { objectType?: string }).objectType === "string" &&
        (change as { objectType: string }).objectType.endsWith("::petlofi::Pet")
      ) {
        const objectId = (change as { objectId?: string }).objectId;
        if (typeof objectId === "string") {
          return objectId;
        }
      }
    }
    return null;
  }

  function sendHeldMoveVector() {
    const held = heldDirectionsRef.current;
    const dx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    const dy = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
    sendGameCommand({ type: "setMoveVector", dx, dy });

    if (dx !== 0 || dy !== 0) {
      const nextState = dx < 0 ? "running-left" : dx > 0 ? "running-right" : "running";
      setPetState(nextState);
      setGameActionMessage(worldMode === "arena" ? "Holding movement in Cuddle Arena." : "Holding movement through PetLofi Village.");
      return;
    }

    setPetState("idle");
  }

  function startHeldMove(direction: HeldDirection) {
    if (heldDirectionsRef.current.has(direction)) {
      return;
    }

    heldDirectionsRef.current.add(direction);
    sendHeldMoveVector();
  }

  function stopHeldMove(direction: HeldDirection) {
    if (!heldDirectionsRef.current.delete(direction)) {
      return;
    }

    sendHeldMoveVector();
  }

  function stopAllHeldMoves() {
    if (heldDirectionsRef.current.size === 0) {
      return;
    }

    heldDirectionsRef.current.clear();
    sendHeldMoveVector();
  }

  function dpadDelta(direction: HeldDirection) {
    if (direction === "up") {
      return { x: 0, y: -3 };
    }
    if (direction === "down") {
      return { x: 0, y: 3 };
    }
    if (direction === "left") {
      return { x: -3, y: 0 };
    }
    return { x: 3, y: 0 };
  }

  function startDpadHold(direction: HeldDirection) {
    dpadPressStartedAtRef.current[direction] = window.performance.now();
    startHeldMove(direction);
  }

  function stopDpadHold(direction: HeldDirection) {
    const startedAt = dpadPressStartedAtRef.current[direction];
    dpadPressStartedAtRef.current[direction] = 0;
    stopHeldMove(direction);

    if (startedAt && window.performance.now() - startedAt < 145) {
      const delta = dpadDelta(direction);
      movePetBy(delta.x, delta.y);
    }
  }

  function cancelDpadHold(direction: HeldDirection) {
    dpadPressStartedAtRef.current[direction] = 0;
    stopHeldMove(direction);
  }

  function handleSceneZoneChange(zoneId: GameHotspotId) {
    const zone = VILLAGE_ZONES.find((item) => item.id === zoneId);
    if (!zone) {
      return;
    }

    setActiveVillageZoneId(zoneId);
    setGameActionMessage(`${activeIdentity}'s companion is near ${zone.title}. ${zone.action} is ready.`);
  }

  function handleSceneAction(action: string) {
    if (action.includes("snack")) {
      playSfx("pickup");
    } else if (action.includes("cuddle") || action.includes("special")) {
      playSfx("click");
    }

    if (action === "arena_home_to_village") {
      setWorldMode("village");
      return;
    }

    if (action === "snack_pickup") {
      if (worldMode === "arena") {
        setGameActionMessage("Snack picked up: safety restored and arena score increased.");
        addProofEntries([
          { label: "Latest game action", value: "arena_snack_pickup" },
          { label: "Latest animation state", value: petState }
        ]);
        return;
      }
      void runLocalGameAction("feed");
      return;
    }

    if (action === "locked_companion_waiting") {
      setGameActionMessage("Locked companion slots are future limited SuiNS community pets.");
      addProofEntries([
        { label: "Latest game action", value: "locked_companion_waiting" },
        { label: "Latest animation state", value: "waiting" }
      ]);
      return;
    }

    if (
      action.startsWith("walk_to_") ||
      action.startsWith("visit_friend_") ||
      action === "free_walk" ||
      action === "village_walk" ||
      action === "map_click_walk" ||
      action === "arena_dodge" ||
      action === "arena_run_started" ||
      action === "arena_cuddle_attack" ||
      action === "arena_agent_special" ||
      action === "arena_agent_special_charged" ||
      action === "arena_victory" ||
      action === "arena_failed"
    ) {
      addProofEntries([
        { label: "Latest game action", value: action },
        { label: "Latest animation state", value: petState }
      ]);
    }
  }

  function addMapFriend() {
    const nextFriend = FRIEND_POOL.find((friend) => !mapFriends.some((existing) => existing.id === friend.id));
    if (!nextFriend) {
      setGameActionMessage("All local friend plots are already patched into the map contract.");
      return;
    }

    const nextRevision = mapRevision + 1;
    const nextFriends = [...mapFriends, nextFriend];
    setMapFriends(nextFriends);
    setMapRevision(nextRevision);
    setWorldMode("village");
    setPetState("waving");
    sendGameCommand({ type: "syncMap", friends: nextFriends, mapRevision: nextRevision });
    setSingleTimeline({
      petState: "waving",
      label: "Map pixel patched",
      detail: `${nextFriend.name} claimed a friend plot. The village map expanded from local map-contract revision ${mapRevision} to r${nextRevision}.`
    });
    setGameActionMessage(`${nextFriend.name} joined the village. Map pixel contract r${nextRevision} added a new friend plot.`);
    addProofEntries([
      { label: "Latest game action", value: "add_friend_to_map" },
      { label: "Map contract revision", value: `r${nextRevision}` },
      { label: "Latest map patch", value: `add_friend(${nextFriend.name})` },
      { label: "Friend plots", value: String(nextFriends.length) }
    ]);
    pushMessengerMessage("Map Contract", `${nextFriend.name} joined PetLofi Village; pixel plot committed in local proof mode.`);
  }

  function equipOwnedLofiNft(nft: OwnedLofiNft) {
    setActiveLofiSource(null);
    setActiveLofiVariant(null);
    setActiveGeneratedPack(null);
    setPetName(nft.name);
    setPetId(nft.objectId);
    setIsMinted(true);
    setIsNameEquipped(true);
    setPetState("waving");
    sendGameCommand({ type: "setPetState", petState: "waving" });
    setSingleTimeline({
      petState: "waving",
      label: "Wallet Lofi equipped",
      detail:
        nft.source === "wallet"
          ? `${nft.name} from ${shortAddress(owner)} is now the active identity companion.`
          : `${nft.name} demo skin is equipped until a wallet Lofi NFT is found.`
    });
    setGameActionMessage(`${nft.name} equipped from ${nft.source === "wallet" ? "wallet address" : "local demo set"}. Animation still uses the Codex-compatible Lofi rig.`);
    addProofEntries([
      { label: "Active Lofi NFT", value: nft.name },
      { label: "Active Lofi object", value: nft.objectId },
      { label: "NFT source", value: nft.source === "wallet" ? shortAddress(owner) : "local-demo" },
      { label: "Latest game action", value: "equip_owned_lofi_nft" },
      { label: "Latest animation state", value: "waving" }
    ]);
    pushMessengerMessage("Petdex Gallery", `${activeIdentity} equipped ${nft.name} as the visible Lofi companion.`);
  }

  async function scanOwnerForLofiNfts(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const addressToScan = scanAddressInput.trim();

    if (!addressToScan) {
      setScanError("Paste a Sui owner address to scan its Lofi NFTs.");
      return;
    }

    setIsLoadingLofiNfts(true);
    setScanError("");

    try {
      const result = await loadOwnedLofiObjects(suiClient, addressToScan);
      setOwnedLofiNfts(result.lofiNfts);
      setLastScannedAddress(addressToScan);
      setGameActionMessage(`Scanned ${shortAddress(addressToScan)}: ${result.lofiNfts.length} Lofi/Yeti-like NFT match${result.lofiNfts.length === 1 ? "" : "es"} from ${result.objectCount} Sui objects.`);
      addProofEntries([
        { label: "Latest game action", value: "scan_owner_lofi_nfts" },
        { label: "Scanned owner", value: shortAddress(addressToScan) },
        { label: "Scanned objects", value: String(result.objectCount) },
        { label: "Lofi NFT matches", value: String(result.lofiNfts.length) }
      ]);
      pushMessengerMessage("Petdex Scanner", `${shortAddress(addressToScan)} scan found ${result.lofiNfts.length} Lofi/Yeti-like companion candidate${result.lofiNfts.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setOwnedLofiNfts([]);
      setLastScannedAddress(addressToScan);
      setScanError(error instanceof Error ? error.message : "Could not scan this owner address.");
    } finally {
      setIsLoadingLofiNfts(false);
    }
  }

  async function loadTradeportTopLofi(manual: boolean) {
    setIsLoadingMarket(true);
    setMarketError("");

    try {
      const response = await fetch("/api/lofi/top", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as TradeportLofiTopResponse;
      const animationRoster = buildUniqueLofiAnimationVariants(
        [...payload.mostExpensive, ...payload.rarest],
        payload.animationMintFeeSui
      );
      setLofiMarket(payload);
      setLofiAnimationRoster(animationRoster);

      if (payload.warning) {
        setMarketError(payload.warning);
      }

      if (manual || !payload.warning) {
        addProofEntries([
          { label: "Latest game action", value: "crawl_tradeport_lofi_top10" },
          { label: "TradePort collection", value: `${payload.collection.supply} NFTs / floor ${payload.collection.floorSui} SUI` },
          { label: "Animation mint fee", value: `${payload.animationMintFeeSui} SUI` }
        ]);
      }

      if (manual) {
        pushMessengerMessage("Petdex Crawler", `Crawled TradePort Lofi top 10 and loaded ${animationRoster.length} preview rigs. Read generated status to see which offline hatch-pet packs are ready.`);
        void loadGeneratedLofiPacks(activeLofiSource?.tokenId ?? null, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "TradePort crawl failed.";
      setMarketError(message);
      pushMessengerMessage("Petdex Crawler", `TradePort crawl failed: ${message}`);
    } finally {
      setIsLoadingMarket(false);
    }
  }

  async function loadGeneratedLofiPacks(selectedTokenId?: string | null, announce = false) {
    setIsGeneratingLofiPacks(true);
    setGeneratedPackError("");

    try {
      const suffix = selectedTokenId ? `?selected=${encodeURIComponent(selectedTokenId)}` : "";
      const response = await fetch(`/api/lofi/generated${suffix}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as LofiGeneratedResponse;
      setLofiGeneratedPacks(payload.packs);
      if (payload.warning) {
        setGeneratedPackError(payload.warning);
      }

      addProofEntries([
        { label: "Generated Lofi packs", value: `${payload.readyCount} real / ${payload.previewCount} preview / ${payload.queuedCount} queued` },
        { label: "Latest game action", value: "read_top10_lofi_manifest" }
      ]);

      if (announce) {
        pushMessengerMessage(
          "Petdex Animator",
          `Loaded top-10 Lofi pack status: ${payload.readyCount} real ready, ${payload.previewCount} fallback preview, ${payload.queuedCount} queued.`
        );
      }

      return payload.packs;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read generated Lofi packs.";
      setGeneratedPackError(message);
      pushMessengerMessage("Petdex Animator", `Generated pack status failed: ${message}`);
      return [];
    } finally {
      setIsGeneratingLofiPacks(false);
    }
  }

  function showOfflineGenerationNote(selectedTokenId?: string | null) {
    const selectedText = selectedTokenId ? `Selected token ${shortObjectId(selectedTokenId)} needs an offline hatch-pet generation pass.` : "Batch A needs an offline hatch-pet generation pass.";
    const message = `${selectedText} The app can read pre-generated packs from /pets, but runtime generation is disabled for the Cloudflare-compatible build.`;
    setGeneratedPackError(message);
    setGameActionMessage(message);
    addProofEntries([
      { label: "Latest game action", value: "offline_lofi_generation_required" },
      { label: "Generated pack mode", value: "pre-generated / hatch-pet offline" }
    ]);
    pushMessengerMessage("Petdex Animator", message);
  }

  async function requestAnimationMintPass(item: TradeportLofiItem) {
    setActiveLofiSource(item);
    const existingPack = lofiGeneratedPacks.find((pack) => pack.tokenId === item.tokenId);
    if (existingPack && isRealGeneratedPack(existingPack)) {
      equipGeneratedLofiPack(existingPack, item);
      return;
    }

    if (!existingPack || existingPack.status === "queued" || existingPack.status === "preview") {
      void loadGeneratedLofiPacks(item.tokenId, false);
      if (existingPack?.status === "preview") {
        setGameActionMessage(`${item.name} has a fallback preview only. Generate a real hatch-pet atlas offline from resolved NFT art, then Read status to equip it.`);
      } else if (existingPack?.status === "queued") {
        setGameActionMessage(`${item.name} is queued for offline NFT-to-atlas generation. Showing the shared preview rig while the real pack is missing from /pets.`);
      } else {
        setGameActionMessage(`${item.name} is selected but no generated pack was found yet. Showing a preview rig until it is added to the top-10 manifest.`);
      }
      addProofEntries([
        { label: "Selected Lofi NFT", value: item.name },
        { label: "Selected Lofi token", value: shortObjectId(item.tokenId) },
        { label: "Generated pack status", value: existingPack ? generatedPackLabel(existingPack) : "Queued" },
        { label: "Latest game action", value: "select_lofi_generation_candidate" }
      ]);
    }

    const variant = lofiAnimationRoster.find((candidate) => candidate.tokenId === item.tokenId);
    if (variant) {
      equipLofiAnimationVariant(variant, item);
      return;
    }

    const isOwnedByCurrentWallet = Boolean(
      account?.address && item.owner && item.owner.toLowerCase() === account.address.toLowerCase()
    );

    if (isOwnedByCurrentWallet) {
      setPetName(item.name);
      setPetId(`tradeport:${item.id}`);
      setIsMinted(true);
      setIsNameEquipped(true);
      setPetState("waving");
      sendGameCommand({ type: "setPetState", petState: "waving" });
      setSingleTimeline({
        petState: "waving",
        label: "Owned Lofi equipped",
        detail: `${item.name} is owned by the connected wallet, so PetLofi can generate its animation pack without the external mint pass.`
      });
      setGameActionMessage(`${item.name} equipped from the official Lofi collection crawl.`);
      addProofEntries([
        { label: "Active Lofi NFT", value: item.name },
        { label: "Active Lofi object", value: item.tokenId },
        { label: "Rarity rank", value: item.ranking ? `#${item.ranking}` : "unknown" },
        { label: "Latest game action", value: "equip_tradeport_lofi_nft" },
        { label: "Latest animation state", value: "waving" }
      ]);
      pushMessengerMessage("Petdex Gallery", `${activeIdentity} equipped owned ${item.name} from the official Lofi collection.`);
      return;
    }

    // Not owned and no pre-generated pack: let the player "try on" the look as a
    // cosmetic preview skin. Clearly flagged as not owned on-chain.
    const previewVariant = buildLofiAnimationVariant(
      item,
      Math.max(0, selectedMarketItems.findIndex((candidate) => candidate.tokenId === item.tokenId)),
      animationMintFeeSui
    );
    equipLofiAnimationVariant(previewVariant, item);
    setGameActionMessage(`Previewing ${item.name} as a skin — you don't own this NFT, so it's cosmetic only.`);
    addProofEntries([
      { label: "Preview skin", value: item.name },
      { label: "Skin token", value: shortObjectId(item.tokenId) },
      { label: "Owned by", value: shortObjectId(item.owner) },
      { label: "Latest game action", value: "preview_lofi_skin" }
    ]);
    pushMessengerMessage("Petdex", `${activeIdentity} is previewing ${item.name} as a cosmetic skin (not owned).`);
  }

  function equipGeneratedLofiPack(pack: LofiGeneratedPetPack, sourceItem?: TradeportLofiItem) {
    if (!isRealGeneratedPack(pack)) {
      setGameActionMessage(`${pack.name} is only a fallback preview right now. Generate with a resolved NFT source image before equipping it as a real atlas.`);
      pushMessengerMessage("Petdex Animator", `${pack.name} stayed in preview mode because no real NFT source image was resolved yet.`);
      return;
    }

    const item = sourceItem ?? selectedMarketItems.find((candidate) => candidate.tokenId === pack.tokenId);
    if (item) {
      setActiveLofiSource(item);
    }
    setActiveGeneratedPack(pack);
    setActiveLofiVariant(null);
    setPetName(pack.name);
    setPetId(pack.packId);
    setIsMinted(true);
    setIsNameEquipped(true);
    setPetState("waving");
    sendGameCommand({
      type: "setPetAtlas",
      atlas: {
        textureKey: `generated-${pack.packId}`,
        spritesheetUrl: pack.spritesheetUrl,
        petJsonUrl: pack.petJsonUrl
      }
    });
    sendGameCommand({ type: "setPetVariant", variant: null });
    sendGameCommand({ type: "setPetState", petState: "waving" });
    const refinedLabel = pack.generationMode === "hatch-refined";
    setSingleTimeline({
      petState: "waving",
      label: refinedLabel ? "Refined Lofi atlas equipped" : "Real Lofi atlas equipped",
      detail: `${pack.name} is running from a generated 8x9 NFT-to-atlas pet pack sourced via ${pack.sourceOrigin ?? "NFT image"}, not the shared preview tint rig.`
    });
    setGameActionMessage(
      `${pack.name} equipped as a ${refinedLabel ? "hatch-refined" : "real NFT-sourced"} 8x9 companion. Arena proofs now include token, source hash, origin, and pack hash metadata.`
    );
    addProofEntries([
      { label: "Active Lofi pack", value: pack.packId },
      { label: "Active Lofi token", value: shortObjectId(pack.tokenId) },
      { label: "Generated pack status", value: generatedPackLabel(pack) },
      { label: "Generated source origin", value: pack.sourceOrigin ?? "unknown" },
      { label: "Generated mode", value: pack.generationMode ?? "deterministic" },
      { label: "Source image hash", value: pack.sourceImageHash?.slice(0, 16) ?? "pending" },
      { label: "Generated pack hash", value: pack.packHash?.slice(0, 16) ?? "pending" },
      { label: "Latest game action", value: "equip_generated_lofi_atlas" },
      { label: "Latest animation state", value: "waving" }
    ]);
    pushMessengerMessage(
      "Petdex Animator",
      `${pack.name} equipped as a ${refinedLabel ? "refined" : "real generated"} Lofi atlas for Cuddle Arena.`
    );
  }

  function equipLofiAnimationVariant(variant: LofiAnimationVariant, sourceItem?: TradeportLofiItem) {
    const item = sourceItem ?? selectedMarketItems.find((candidate) => candidate.tokenId === variant.tokenId);
    if (item) {
      setActiveLofiSource(item);
    }
    setActiveGeneratedPack(null);
    setActiveLofiVariant(variant);
    setPetName(variant.name);
    setPetId(`lofi-animation-preview:${variant.tokenId}`);
    setPetState("waving");
    sendGameCommand({
      type: "setPetVariant",
      variant: {
        id: variant.id,
        name: variant.name,
        tintHex: variant.tintHex,
        accentHex: variant.accentHex
      }
    });
    sendGameCommand({ type: "setPetState", petState: "waving" });
    setSingleTimeline({
      petState: "waving",
      label: "Lofi animation equipped",
      detail: `${variant.name} is now the active animated preview rig. Full bespoke hatch-pet atlas generation still requires the animation pass.`
    });
    setGameActionMessage(`${variant.name} equipped as a generated top-10 animation preview. This changes the game pet now; bespoke atlas generation is the next paid pass step.`);
    addProofEntries([
      { label: "Active Lofi animation", value: variant.name },
      { label: "Animation source token", value: shortObjectId(variant.tokenId) },
      { label: "Source rank", value: variant.ranking ? `#${variant.ranking}` : "unknown" },
      { label: "Animation pass", value: `${variant.animationPassFeeSui} SUI for bespoke atlas` },
      { label: "Latest game action", value: "equip_top10_lofi_animation" },
      { label: "Latest animation state", value: "waving" }
    ]);
    pushMessengerMessage("Petdex Animator", `${variant.name} joined the active animated roster from the Lofi top list.`);
  }

  function movePetBy(deltaX: number, deltaY: number) {
    const nextState = deltaX < 0 ? "running-left" : deltaX > 0 ? "running-right" : "running";
    playWalkAnimation(nextState);
    sendGameCommand({ type: "move", dx: deltaX, dy: deltaY });
    setGameActionMessage(worldMode === "arena" ? "Dodging in Cuddle Arena." : "Walking through PetLofi Village. Press E or Interact to use the nearest zone.");
    addProofEntries([
      { label: "Latest game action", value: worldMode === "arena" ? "arena_dodge" : "village_walk" },
      { label: "Latest animation state", value: nextState }
    ]);
  }

  function playWalkAnimation(nextState: PetState) {
    setPetState(nextState);
    sendGameCommand({ type: "setPetState", petState: nextState });
  }

  function walkToZone(zone: VillageZone) {
    const nextState = zone.x < activeVillageZone.x ? "running-left" : "running-right";
    playWalkAnimation(nextState);
    sendGameCommand({ type: "goToZone", zoneId: zone.id });
    setActiveVillageZoneId(zone.id);
    setSingleTimeline({
      petState: nextState,
      label: `Arrived at ${zone.title}`,
      detail: zone.detail
    });
    setGameActionMessage(`${activeIdentity}'s companion is at ${zone.title}. ${zone.action} is ready.`);
  }

  async function interactWithVillageZone(zone: VillageZone) {
    walkToZone(zone);
    await wait(180);

    if (zone.id === "suins-gate") {
      if (!isMinted) {
        await mintLofiPet();
        return;
      }

      if (!isNameEquipped) {
        await runLocalGameAction("equip-suins");
        return;
      }

      await runLocalGameAction("evolve");
      return;
    }

    if (zone.id === "agent-forge") {
      await executeAgentRun();
      return;
    }

    if (zone.id === "memwal-library") {
      await saveMemory();
      return;
    }

    if (zone.id === "walrus-vault") {
      await syncMemoryAction();
      return;
    }

    if (zone.id === "rest-hut") {
      await runLocalGameAction("rest");
      return;
    }

    if (zone.id === "feed-stall") {
      await runLocalGameAction("feed");
      return;
    }

    setIsPetdexOpen(true);
    setPetState("waving");
    addProofEntries([
      { label: "Latest game action", value: "open_petdex" },
      { label: "Latest animation state", value: "waving" }
    ]);
    pushMessengerMessage("Petdex Gallery", `${activeIdentity} opened the companion gallery.`);
  }

  async function mintLofiPet() {
    if (!account?.address) {
      setMintMessage("Connect your Sui wallet to mint / play on-chain.");
      setPetState("waiting");
      return;
    }
    setIsMinting(true);
    setMintMessage("Minting CLAY Lofi Yeti...");
    setGameActionMessage("");
    setPetState("waiting");
    addProofEntries([
      { label: "Latest action type", value: "mint_pet" },
      { label: "Latest animation state", value: "waiting" }
    ]);

    try {
      const [petJsonResponse, spritesheetResponse] = await Promise.all([
        fetch("/pets/lofi-yeti/pet.json"),
        fetch("/pets/lofi-yeti/spritesheet.webp")
      ]);

      if (!petJsonResponse.ok || !spritesheetResponse.ok) {
        throw new Error("Default CLAY Lofi pet pack is missing.");
      }

      const petJson = await petJsonResponse.blob();
      const spritesheet = await spritesheetResponse.blob();
      const data = new FormData();
      data.set("petJson", new File([petJson], "pet.json", { type: "application/json" }));
      data.set("spritesheet", new File([spritesheet], "spritesheet.webp", { type: "image/webp" }));

      const response = await fetch("/api/walrus/upload", {
        method: "POST",
        body: data
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as PetPackUploadResponse;
      setLatestWalrusBlob(payload.blobId);

      const mintResult = await executeTx(buildMintPetTransaction(payload.blobId));
      let objectId = extractMintedPetId(mintResult as { objectChanges?: unknown });
      if (!objectId) {
        const detailed = await suiClient.getTransactionBlock({
          digest: mintResult.digest,
          options: { showObjectChanges: true }
        });
        objectId = extractMintedPetId(detailed as { objectChanges?: unknown });
      }

      if (!objectId) {
        throw new Error("Minted on-chain but could not locate the new Pet object id.");
      }

      const network = getPublicConfig().suiNetwork;
      setPetName(payload.pet.displayName);
      setPetId(objectId);
      setIsMinted(true);
      setLastTx({ label: "mint_pet", digest: mintResult.digest });
      setLastObject(objectId);
      setMintMessage(
        `${payload.pet.displayName} minted on-chain to Sui ${network} (object ${shortObjectId(objectId)}). Asset blob ${payload.blobId} stored via ${payload.storage}.`
      );
      addProofEntries([
        { label: "Minted pet object", value: objectId },
        { label: "Mint tx digest", value: mintResult.digest },
        { label: "Mint asset blob", value: payload.blobId },
        { label: "Mint proof URL", value: payload.proofUrl },
        { label: "Latest action type", value: "mint_pet" },
        { label: "Latest animation state", value: "waving" }
      ]);
      setTimeline([
        { petState: "waiting", label: "Pack validated", detail: "pet.json and spritesheet.webp matched the 8x9 Codex pet atlas." },
        { petState: "jumping", label: "Ownership minted", detail: `mint_pet committed on Sui ${network}; the Pet object is now owned by your wallet.` },
        { petState: "waving", label: "Ready for work", detail: "Run an AI task to earn XP, update streak, and produce a proof." }
      ]);
      setActiveStage(1);
      setPetState("jumping");
      await wait(700);
      setActiveStage(2);
      setPetState("waving");
      await refreshPetStats(objectId);
      pushMessengerMessage(activeIdentity, `minted ${payload.pet.displayName} on Sui ${network}; Walrus asset blob ${payload.blobId} is now in the passport.`);
    } catch (error) {
      setPetState("failed");
      setMintMessage(error instanceof Error ? error.message : "Mint failed");
      addProofEntries([
        { label: "Latest action type", value: "mint_pet_failed" },
        { label: "Latest animation state", value: "failed" }
      ]);
    } finally {
      setIsMinting(false);
    }
  }

  async function executeAgentRun() {
    setIsRunning(true);
    setAgentResult(null);
    setMemoryMessage("");
    setGameActionMessage("");

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, owner, petId, petName, gameState })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as AgentRunResponse;
      const nextTimeline = payload.result.stages.map((stage) => ({
        petState: stage.petState as PetState,
        label: AGENT_STAGE_LABELS[stage.action] ?? stage.label,
        detail: stage.detail
      }));

      setTimeline(nextTimeline);
      for (let index = 0; index < nextTimeline.length; index += 1) {
        setActiveStage(index);
        setPetState(nextTimeline[index].petState);
        await wait(620);
      }

      setAgentResult(payload.result);
      setPetState(payload.result.petState as PetState);
      setLatestWalrusBlob(payload.walrus.blobId);
      addProofEntries([
        { label: "Latest action type", value: payload.result.action },
        { label: "Latest animation state", value: payload.result.petState },
        { label: "Latest task digest", value: payload.result.proof.digest },
        { label: "Walrus proof", value: `${payload.walrus.blobId} (${payload.walrus.storage})` },
        { label: "Proof URL", value: payload.walrus.proofUrl }
      ]);

      if (account?.address && isMinted) {
        try {
          const recordResult = await executeTx(buildRecordActionTransaction(petId, 4, payload.walrus.blobId));
          setLastTx({ label: "record_agent_action", digest: recordResult.digest });
          addProofEntries([
            { label: "On-chain action", value: "record_agent_action(completed)" },
            { label: "Record tx digest", value: recordResult.digest }
          ]);
          await refreshPetStats(petId);
        } catch (recordError) {
          const message = recordError instanceof Error ? recordError.message : "record_agent_action failed on-chain.";
          setGameActionMessage(`Agent work succeeded but on-chain record_agent_action failed: ${message}`);
          addProofEntries([{ label: "On-chain action error", value: message }]);
        }
      } else {
        addProofEntries([{ label: "On-chain", value: "Connect wallet + mint to record this run on Sui" }]);
        pushMessengerMessage("Demo", "AI work + Walrus proof are off-chain (no wallet needed). Connect a wallet to record it on Sui.");
      }
      if (worldMode === "arena" && arenaSnapshot.phase === "running") {
        sendGameCommand({ type: "chargeAgentSpecial" });
        setGameActionMessage("Agent proof charged a full-screen cuddle burst. Press Cuddle Attack to spend it.");
        addProofEntries([
          { label: "Arena special", value: "charged_by_agent_task" },
          { label: "Latest game action", value: "arena_agent_special_charged" }
        ]);
      }
      pushMessengerMessage(activeIdentity, `completed agent work with ${petName}; proof ${payload.result.proof.digest.slice(0, 12)} is linked.`);
    } catch (error) {
      setPetState("failed");
      setSingleTimeline({
        petState: "failed",
        label: "Agent blocked",
        detail: "The run failed before producing a proof. Nothing was committed on-chain."
      });
      setAgentResult({
        runId: "failed",
        action: "failed",
        petState: "failed",
        title: "Agent run failed",
        summary: error instanceof Error ? error.message : "Unknown error",
        suggestedMemory: "",
        stages: [],
        proof: {
          digest: "",
          createdAt: new Date().toISOString(),
          promptHash: "",
          memorySummary: ""
        },
        gameDelta: { xp: 0, mood: -8, energy: -8, streak: 0 }
      });
      addProofEntries([
        { label: "Latest action type", value: "failed" },
        { label: "Latest animation state", value: "failed" },
        { label: "Latest game action", value: "record_agent_action(failed)" }
      ]);
      pushMessengerMessage("CLAY Lofi Yeti", `${activeIdentity}'s run was blocked. Mood and energy dropped, streak reset.`);
    } finally {
      setIsRunning(false);
    }
  }

  async function rememberLatestAgentMemory(): Promise<MemorySaveResponse | null> {
    if (!agentResult) {
      setPetState("waiting");
      setMemoryMessage("Run an agent task first, then save or sync its memory.");
      return null;
    }

    const response = await fetch("/api/memwal/remember", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner,
        petId,
        content: agentResult.suggestedMemory,
        tags: ["agent-run", "clay-demo", petName]
      })
    });

    if (!response.ok) {
      setPetState("failed");
      setMemoryMessage(await response.text());
      return null;
    }

    const payload = (await response.json()) as MemorySaveResponse;
    setGameState((current) => ({ ...current, latestMemoryBlob: payload.walrus.blobId }));
    setLatestWalrusBlob(payload.walrus.blobId);
    setMemoryMessage(`Saved ${payload.record.id} and linked ${payload.walrus.blobId} (${payload.walrus.storage}).`);
    addProofEntries([{ label: "Latest memory blob", value: payload.walrus.blobId }]);
    return payload;
  }

  async function saveMemory() {
    const payload = await rememberLatestAgentMemory();
    if (!payload) {
      return;
    }

    setPetState("review");
    setSingleTimeline({
      petState: "review",
      label: "Memory saved",
      detail: "MemWal stored the task summary and Walrus produced a memory proof blob."
    });
    addProofEntries([
      { label: "Latest action type", value: "sync_memory" },
      { label: "Latest animation state", value: "review" },
      { label: "Latest game action", value: "sync_memory" }
    ]);
    pushMessengerMessage("MemWal Library", `${activeIdentity}'s pet remembered the task and linked ${payload.walrus.blobId}.`);
  }

  async function syncMemoryAction() {
    if (!account?.address) {
      setPetState("waiting");
      setGameActionMessage("Connect your Sui wallet to mint / play on-chain.");
      return;
    }
    if (!isMinted) {
      setPetState("waiting");
      setGameActionMessage("Mint the pet before syncing memory to its ownership state.");
      return;
    }

    let memoryBlob = gameState.latestMemoryBlob;
    if (!memoryBlob && agentResult) {
      const payload = await rememberLatestAgentMemory();
      memoryBlob = payload?.walrus.blobId;
    }

    if (!memoryBlob) {
      setPetState("waiting");
      setSingleTimeline({
        petState: "waiting",
        label: "Memory needed",
        detail: "Run an agent task and save memory before calling sync_memory."
      });
      setGameActionMessage("No memory blob yet. Run an agent task, then save or sync memory.");
      addProofEntries([
        { label: "Latest game action", value: "sync_memory_waiting" },
        { label: "Latest animation state", value: "waiting" }
      ]);
      return;
    }

    const memoryHash = memoryBlob.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || `hash:${Date.now()}`;

    try {
      const result = await executeTx(buildSyncMemoryTransaction(petId, memoryBlob, memoryHash));
      setPetState("review");
      setSingleTimeline({
        petState: "review",
        label: "Memory synced on-chain",
        detail: "sync_memory(pet, memory_blob, memory_hash) committed on-chain; the pet now carries the latest memory blob."
      });
      setGameActionMessage(`sync_memory committed on-chain for blob ${memoryBlob}.`);
      addProofEntries([
        { label: "Latest memory blob", value: memoryBlob },
        { label: "Sync memory tx digest", value: result.digest },
        { label: "Latest action type", value: "sync_memory" },
        { label: "Latest animation state", value: "review" },
        { label: "Latest game action", value: "sync_memory" }
      ]);
      await refreshPetStats(petId);
      pushMessengerMessage("MemWal Library", `${activeIdentity}'s pet synced memory blob ${memoryBlob} on-chain.`);
    } catch (error) {
      setPetState("failed");
      const message = error instanceof Error ? error.message : "sync_memory failed on-chain.";
      setGameActionMessage(`sync_memory failed: ${message}`);
      addProofEntries([{ label: "On-chain action error", value: message }]);
    }
  }

  async function runLocalGameAction(action: LocalGameAction) {
    if (action !== "move-left" && action !== "move-right" && !account?.address) {
      setPetState("waiting");
      setGameActionMessage("Connect your Sui wallet to mint / play on-chain.");
      addProofEntries([
        { label: "Latest game action", value: `${action}_needs_wallet` },
        { label: "Latest animation state", value: "waiting" }
      ]);
      return;
    }

    if (action !== "move-left" && action !== "move-right" && !isMinted) {
      setPetState("waiting");
      setGameActionMessage("🪙 Mint your pet first — then you can Feed & Rest it.");
      addProofEntries([
        { label: "Latest game action", value: `${action}_waiting_for_owner` },
        { label: "Latest animation state", value: "waiting" }
      ]);
      return;
    }

    if (action === "equip-suins") {
      setIsNameEquipped(true);
      setPetState("waving");
      setSingleTimeline({
        petState: "waving",
        label: "Pet equipped to identity",
        detail: `${activeIdentity} now has ${petName} as its SuiNS companion.`
      });
      setGameActionMessage(`${petName} equipped to ${activeIdentity}. Wallet custody stays with ${shortAddress(owner)}.`);
      addProofEntries([
        { label: "SuiNS companion", value: `${activeIdentity} -> ${petId}` },
        { label: "Latest game action", value: "equip_pet_to_suins" },
        { label: "Latest action type", value: "identity_bind" },
        { label: "Latest animation state", value: "waving" }
      ]);
      pushMessengerMessage(activeIdentity, `equipped ${petName} as the visible companion for this SuiNS identity.`);
      return;
    }

    if (action === "feed") {
      try {
        const result = await executeTx(buildFeedTransaction(petId, 0));
        setPetState("waving");
        setSingleTimeline({
          petState: "waving",
          label: "Fed pet",
          detail: "feed(pet, treat_kind=0, clock) committed on-chain."
        });
        setGameActionMessage("feed(pet) committed on-chain.");
        addProofEntries([
          { label: "Latest game action", value: "feed" },
          { label: "Latest action type", value: "feed" },
          { label: "Feed tx digest", value: result.digest },
          { label: "Latest animation state", value: "waving" }
        ]);
        await refreshPetStats(petId);
        pushMessengerMessage("CLAY Lofi Yeti", `${activeIdentity} fed me on-chain. I am ready for the next proof.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "feed failed on-chain.";
        setPetState("waiting");
        setGameActionMessage(`feed failed: ${message}`);
        addProofEntries([{ label: "On-chain action error", value: message }]);
      }
      return;
    }

    if (action === "rest") {
      try {
        const result = await executeTx(buildRestTransaction(petId));
        setPetState("idle");
        setSingleTimeline({
          petState: "idle",
          label: "Rested pet",
          detail: "rest(pet, clock) committed on-chain."
        });
        setGameActionMessage("rest(pet) committed on-chain.");
        addProofEntries([
          { label: "Latest game action", value: "rest" },
          { label: "Latest action type", value: "rest" },
          { label: "Rest tx digest", value: result.digest },
          { label: "Latest animation state", value: "idle" }
        ]);
        await refreshPetStats(petId);
        pushMessengerMessage("CLAY Lofi Yeti", `${activeIdentity}'s pet rested on-chain.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "rest failed on-chain.";
        setPetState("waiting");
        setGameActionMessage(`rest failed: ${message}`);
        addProofEntries([{ label: "On-chain action error", value: message }]);
      }
      return;
    }

    if (action === "move-left" || action === "move-right") {
      const nextState = action === "move-left" ? "running-left" : "running-right";
      setPetState(nextState);
      setSingleTimeline({
        petState: nextState,
        label: action === "move-left" ? "Moved left" : "Moved right",
        detail: "Room movement uses the directional rows so the pet feels like an owned companion, not a static NFT."
      });
      setGameActionMessage(`${action} animation previewed for room movement.`);
      addProofEntries([
        { label: "Latest game action", value: action },
        { label: "Latest animation state", value: nextState }
      ]);
      pushMessengerMessage("SuiNS Village", `${activeIdentity}'s companion moved ${action === "move-left" ? "left" : "right"}.`);
      return;
    }

    if (action === "blocked") {
      const proofBlob = latestWalrusBlob || `blocked:${Date.now()}`;
      try {
        const result = await executeTx(buildRecordActionTransaction(petId, 3, proofBlob));
        setPetState("failed");
        setSingleTimeline({
          petState: "failed",
          label: "Blocked task",
          detail: "record_agent_action(failed) committed on-chain: mood and energy dropped, streak reset."
        });
        setGameActionMessage("record_agent_action(failed) committed on-chain.");
        addProofEntries([
          { label: "Latest game action", value: "record_agent_action(failed)" },
          { label: "Latest action type", value: "failed" },
          { label: "Blocked tx digest", value: result.digest },
          { label: "Latest animation state", value: "failed" }
        ]);
        await refreshPetStats(petId);
        pushMessengerMessage("Proof Board", `${activeIdentity} recorded a blocked task on-chain; the pet proof trail shows the failed state.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "record_agent_action(failed) failed on-chain.";
        setPetState("waiting");
        setGameActionMessage(`record_agent_action(failed) failed: ${message}`);
        addProofEntries([{ label: "On-chain action error", value: message }]);
      }
      return;
    }

    if (!canEvolvePet(gameState)) {
      setPetState("waiting");
      setSingleTimeline({
        petState: "waiting",
        label: "Evolution locked",
        detail: `Reach level ${evolutionRequiredLevel} before calling evolve(pet, clock).`
      });
      setGameActionMessage(`Evolve locked until level ${evolutionRequiredLevel}. Current level: ${gameState.level}.`);
      addProofEntries([
        { label: "Latest game action", value: "evolve_locked" },
        { label: "Latest animation state", value: "waiting" }
      ]);
      return;
    }

    try {
      const result = await executeTx(buildEvolveTransaction(petId));
      setPetState("jumping");
      setSingleTimeline({
        petState: "jumping",
        label: "Pet evolved",
        detail: "evolve(pet, clock) committed on-chain: evolution stage increased."
      });
      setGameActionMessage("evolve(pet) committed on-chain.");
      addProofEntries([
        { label: "Latest game action", value: "evolve" },
        { label: "Latest action type", value: "evolve" },
        { label: "Evolve tx digest", value: result.digest },
        { label: "Latest animation state", value: "jumping" }
      ]);
      await refreshPetStats(petId);
      pushMessengerMessage("SuiNS Gate", `${activeIdentity}'s companion evolved on-chain as identity reputation increased.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "evolve failed on-chain.";
      setPetState("waiting");
      setGameActionMessage(`evolve failed: ${message}`);
      addProofEntries([{ label: "On-chain action error", value: message }]);
    }
  }

  function previewAnimation(meaning: AnimationMeaning) {
    setPetState(meaning.state);
    sendGameCommand({ type: "setPetState", petState: meaning.state });
    setSingleTimeline({
      petState: meaning.state,
      label: meaning.title,
      detail: meaning.useCase
    });
    setGameActionMessage(`${meaning.state}: ${meaning.useCase}`);
    addProofEntries([
      { label: "Latest animation state", value: meaning.state },
      { label: "Latest game action", value: `animation:${meaning.trigger}` }
    ]);
  }

  function runArenaCuddleAttack() {
    sendGameCommand({ type: "cuddle" });
  }

  function startArenaRun() {
    playSfx("play");
    setWorldMode("arena");
    setArenaSummary(null);
    setArenaProofMessage("");
    setArenaSnapshot(createIdleArenaSnapshot());
    sendGameCommand({ type: "startArenaRun" });
    setPetState("running");
    setSingleTimeline({
      petState: "running",
      label: "Arena run started",
      detail: `Survive ${ARENA_RUN_SECONDS}s, collect snacks, clear enemies, and save the proof receipt.`
    });
    setGameActionMessage("Cuddle Arena started. Hold arrows/D-pad to dodge, collect snacks, and use cuddle bursts.");
    addProofEntries([
      { label: "Latest game action", value: "arena_run_started" },
      { label: "Arena target", value: `${ARENA_RUN_SECONDS}s survival` },
      { label: "Latest animation state", value: "running" }
    ]);
    pushMessengerMessage("Cuddle Arena", `${activeIdentity}'s pet entered a ${ARENA_RUN_SECONDS}s survival run.`);
  }

  function resetArenaRun() {
    setArenaSummary(null);
    setArenaProofMessage("");
    setArenaSnapshot(createIdleArenaSnapshot());
    sendGameCommand({ type: "resetArenaRun" });
    setPetState("idle");
    setSingleTimeline(starterTimeline[0]);
    setGameActionMessage("Arena reset. Start a new run when ready.");
  }

  function handleArenaTick(snapshot: ArenaRunSnapshot) {
    setArenaSnapshot(snapshot);
  }

  function handleArenaComplete(summary: ArenaRunSummary) {
    setArenaSummary(summary);
    setArenaSnapshot((current) => ({
      ...current,
      phase: summary.outcome === "victory" ? "victory" : "failed",
      score: summary.score,
      safety: summary.safety,
      snacksCollected: summary.snacksCollected,
      enemiesCleared: summary.enemiesCleared,
      hitsTaken: summary.hitsTaken,
      timeLeftMs: Math.max(0, current.timeLeftMs),
      specialCharged: false,
      cuddleReady: false
    }));
    setGameState((current) => {
      const xpGain = summary.outcome === "victory" ? Math.max(24, Math.round(summary.score / 8)) : 6;
      const xp = current.xp + xpGain;
      return {
        ...current,
        xp,
        level: Math.floor(xp / 100) + 1,
        mood: Math.max(0, Math.min(100, current.mood + (summary.outcome === "victory" ? 8 : -10))),
        energy: Math.max(0, Math.min(100, current.energy - Math.max(4, summary.hitsTaken * 4))),
        streak: summary.outcome === "victory" ? current.streak + 1 : 0
      };
    });
    setPetState(summary.outcome === "victory" ? "jumping" : "failed");
    setSingleTimeline({
      petState: summary.outcome === "victory" ? "jumping" : "failed",
      label: summary.outcome === "victory" ? "Arena cleared" : "Arena failed",
      detail: `Score ${summary.score}; snacks ${summary.snacksCollected}; enemies ${summary.enemiesCleared}; hits ${summary.hitsTaken}.`
    });
    setGameActionMessage(
      summary.outcome === "victory"
        ? `Victory: score ${summary.score}. Save the arena proof receipt to Walrus/local proof.`
        : `Failed: safety reached ${summary.safety}. Save the failed-run receipt or replay.`
    );
    addProofEntries([
      { label: "Arena outcome", value: summary.outcome },
      { label: "Arena score", value: String(summary.score) },
      { label: "Latest action type", value: `record_agent_action(${arenaOutcomeAction(summary.outcome)})` },
      { label: "Latest animation state", value: summary.outcome === "victory" ? "jumping" : "failed" }
    ]);
    pushMessengerMessage(
      "Cuddle Arena",
      `${activeIdentity}'s pet ${summary.outcome === "victory" ? "survived" : "was overwhelmed"} with score ${summary.score}.`
    );
  }

  async function runArenaAgentCharge() {
    if (arenaSnapshot.phase !== "running" || isRunning) {
      return;
    }

    if (isMinted) {
      await executeAgentRun();
      return;
    }

    setPetState("review");
    setSingleTimeline({
      petState: "review",
      label: "Local agent charge",
      detail: "Local proof mode charged a full-screen cuddle burst before Sui minting."
    });
    await wait(520);
    sendGameCommand({ type: "chargeAgentSpecial" });
    setGameActionMessage("Local agent proof charged a full-screen cuddle burst. Mint the pet later to make this owner-gated.");
    addProofEntries([
      { label: "Arena special", value: "charged_by_local_agent_proof" },
      { label: "Latest game action", value: "arena_agent_special_charged" },
      { label: "Latest animation state", value: "review" }
    ]);
    pushMessengerMessage("Agent Forge", `${activeIdentity}'s local agent charge is ready for Cuddle Arena.`);
  }

  function applyArenaCuddleResult() {
    setGameActionMessage(
      arenaSnapshot.specialCharged
        ? "Agent special fired: full-screen proof burst cleared the arena."
        : `Cuddle burst fired. Cooldown ${Math.round(ARENA_CUDDLE_COOLDOWN_MS / 100) / 10}s.`
    );
    addProofEntries([
      { label: "Latest game action", value: "arena_cuddle_attack" },
      { label: "Latest animation state", value: "jumping" }
    ]);
    pushMessengerMessage("Cuddle Arena", `${activeIdentity}'s pet unleashed a cuddle burst.`);
  }

  async function saveArenaProof() {
    if (!arenaSummary) {
      setArenaProofMessage("Finish an arena run first, then save the proof receipt.");
      return;
    }

    setIsSavingArenaProof(true);
    setArenaProofMessage("Saving arena proof receipt...");

    const receipt: ArenaProofReceipt = {
      kind: "arena-proof",
      identity: activeIdentity,
      petId,
      petName,
      lofi: activeGeneratedPack
        ? {
            tokenId: activeGeneratedPack.tokenId,
            packId: activeGeneratedPack.packId,
            packHash: activeGeneratedPack.packHash,
            status: activeGeneratedPack.status,
            sourceUrl: activeGeneratedPack.sourceUrl,
            spritesheetUrl: activeGeneratedPack.spritesheetUrl,
            sourceMode: activeGeneratedPack.sourceMode,
            sourceOrigin: activeGeneratedPack.sourceOrigin,
            generationMode: activeGeneratedPack.generationMode,
            sourceImageHash: activeGeneratedPack.sourceImageHash
          }
        : activeLofiSource
          ? {
              tokenId: activeLofiSource.tokenId,
              packId: activeLofiVariant?.id ?? "preview-shared-rig",
              status: activeLofiVariant ? "preview" : "queued",
              sourceUrl: activeLofiSource.sourceUrl
            }
          : undefined,
      summary: arenaSummary,
      createdAt: new Date().toISOString()
    };

    try {
      const response = await fetch("/api/arena/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(receipt)
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as ArenaProofResponse;
      setLatestWalrusBlob(payload.blobId);
      setArenaSnapshot((current) => ({ ...current, phase: "proof_saved" }));
      setArenaProofMessage(`Arena proof saved: ${payload.blobId} (${payload.storage}).`);
      addProofEntries([
        { label: "Arena proof blob", value: payload.blobId },
        { label: "Arena proof digest", value: payload.digest },
        { label: "Proof URL", value: payload.proofUrl },
        { label: "Arena Lofi pack", value: activeGeneratedPack?.packId ?? activeLofiVariant?.id ?? petId },
        { label: "Arena Lofi source", value: activeGeneratedPack?.sourceOrigin ?? activeLofiSource?.sourceUrl ?? "default-yeti" },
        { label: "Sui record action", value: isOnChainConfigured() ? arenaOutcomeAction(arenaSummary.outcome) : "ready after package config" }
      ]);
      pushMessengerMessage("Walrus Vault", `${activeIdentity} saved arena proof ${payload.blobId}.`);
    } catch (error) {
      setArenaProofMessage(error instanceof Error ? error.message : "Could not save arena proof.");
    } finally {
      setIsSavingArenaProof(false);
    }
  }

  async function uploadPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setUploadMessage("Uploading pet pack proof...");
    setPetState("waiting");

    const response = await fetch("/api/walrus/upload", {
      method: "POST",
      body: data
    });

    if (!response.ok) {
      setPetState("failed");
      setUploadMessage(await response.text());
      return;
    }

    const payload = (await response.json()) as { blobId: string; proofUrl: string; storage: string; pet: { id: string; displayName: string } };
    setPetId(payload.pet.id);
    setLatestWalrusBlob(payload.blobId);
    setUploadMessage(`Pack accepted for ${payload.pet.displayName}: ${payload.blobId} (${payload.storage}).`);
    addProofEntries([
      { label: "Uploaded animation pack", value: payload.blobId },
      { label: "Pack proof URL", value: payload.proofUrl },
      { label: "Latest game action", value: "upload_animation_pack" },
      { label: "Latest animation state", value: "waiting" }
    ]);
    pushMessengerMessage("Walrus Vault", `${activeIdentity} uploaded an animation pack proof for ${payload.pet.displayName}.`);
  }

  return (
    <main className="game-room">
      <section className={`game-screen ${worldMode === "arena" ? "is-arena" : "is-village"}`}>
        <div className={`game-world-shell ${worldMode === "arena" ? "arena-world" : "village-world"}`} tabIndex={0} aria-label="PetLofi game world. Use arrow keys to move and E to interact.">
          <GameCanvas
            scene={worldMode}
            petState={petState}
            petVariant={activeGamePetVariant}
            petAtlas={activeGamePetAtlas}
            activeZone={activeVillageZoneId}
            friends={mapFriends}
            mapRevision={mapRevision}
            command={gameCommand}
            commandNonce={gameCommandNonce}
            onZoneChange={handleSceneZoneChange}
            onAction={handleSceneAction}
            onPetStateChange={setPetState}
            onCuddleAttack={applyArenaCuddleResult}
            onArenaTick={handleArenaTick}
            onArenaComplete={handleArenaComplete}
          />
        </div>

        <header className="game-topbar">
          <div className="game-brand">
            <div className="brand-mark">
              <Sparkles size={22} />
            </div>
            <div>
              <h1>PetLofi</h1>
              <p>Raise your AI pet on Sui</p>
            </div>
            <div className="mode-switch" aria-label="World mode">
              <button className={worldMode === "arena" ? "active" : ""} type="button" onClick={() => setWorldMode("arena")}>
                Play
              </button>
              <button className={worldMode === "village" ? "active" : ""} type="button" onClick={() => setWorldMode("village")}>
                Home
              </button>
            </div>
          </div>

          <div className="game-wallet">
            <button
              className="hud-toggle"
              type="button"
              onClick={() => setShowOnboarding(true)}
              title="How it works / Watch demo"
            >
              <HelpCircle size={16} />
              Demo
            </button>
            {worldMode === "village" && (
              <button
                className="hud-toggle"
                type="button"
                onClick={() => setShowVillageGuide(true)}
                title="How to play"
              >
                <HelpCircle size={16} />
                Guide
              </button>
            )}
            <button
              className="hud-toggle"
              type="button"
              onClick={() => {
                const next = !sfxMuted;
                setSfxMuted(next);
                setSfxMutedState(next);
                if (typeof window !== "undefined") {
                  try {
                    window.localStorage.setItem("petlofi_muted", next ? "1" : "0");
                  } catch {
                    // ignore storage failures
                  }
                }
              }}
              title={sfxMuted ? "Unmute sound effects" : "Mute sound effects"}
              aria-pressed={sfxMuted}
            >
              {sfxMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {sfxMuted ? "Muted" : "Sound"}
            </button>
            <button
              className="hud-toggle"
              type="button"
              onClick={() => setShowHud((value) => !value)}
              title={showHud ? "Hide panels" : "Show panels"}
              aria-pressed={showHud}
            >
              {showHud ? <EyeOff size={16} /> : <Eye size={16} />}
              {showHud ? "Hide panels" : "Panels"}
            </button>
            <span className="network-pill">Sui {process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet"}</span>
            {!isOnChainConfigured() && <span className="mode-pill">Local proof</span>}
            {!account?.address && (
              <span className="mode-pill demo-pill">
                Demo mode — no wallet ·{" "}
                <a href={faucetUrl()} target="_blank" rel="noreferrer">
                  Get testnet SUI ↗
                </a>
              </span>
            )}
            <ConnectButton />
          </div>
        </header>

        <div className="vitals-bar" aria-label="Pet vitals">
          {(() => {
            const rawAvatarUrl = activeLofiSource?.imageUrl ?? activeLofiVariant?.imageUrl ?? null;
            const avatarUrl = rawAvatarUrl ? normalizeNftImageUrl(rawAvatarUrl) : null;
            const dotColor = hexNumberToCss(activeGamePetVariant?.tintHex ?? 0x6ee7b7);
            return (
              <span className="vital-avatar" title={petName} aria-hidden="true">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="vital-avatar-dot" style={{ background: dotColor }} />
                )}
              </span>
            );
          })()}
          <div className={`vital${gameState.mood < 35 ? " low" : ""}`} title="Mood">
            <Heart size={16} />
            <span className="meter mood"><i style={{ width: `${Math.min(100, gameState.mood)}%` }} /></span>
            <strong>{gameState.mood}</strong>
          </div>
          <div className={`vital${gameState.energy < 30 ? " low" : ""}`} title="Energy">
            <Zap size={16} />
            <span className="meter energy"><i style={{ width: `${Math.min(100, gameState.energy)}%` }} /></span>
            <strong>{gameState.energy}</strong>
          </div>
          <div className="vital xp" title="Level & XP">
            <span className="lv">Lv {gameState.level} ·</span>
            <Star size={16} />
            <strong>{gameState.xp} XP</strong>
            <span className="meter xp-meter"><i style={{ width: `${progress}%` }} /></span>
          </div>
          <span className="goal-chip">→ evolve at Lv {evolutionRequiredLevel}</span>
        </div>

        {worldMode === "village" && showVillageGuide && (
          <div className="village-guide" role="note" aria-label="How to raise your pet">
            <div className="village-guide-head">
              <strong>How to raise your pet</strong>
              <button
                className="village-guide-close"
                type="button"
                aria-label="Dismiss guide"
                onClick={() => {
                  setShowVillageGuide(false);
                  if (typeof window !== "undefined") {
                    try {
                      window.localStorage.setItem("petlofi_village_guide", "dismissed");
                    } catch {
                      // ignore storage failures
                    }
                  }
                }}
              >
                <X size={14} />
              </button>
            </div>
            <ul className="village-guide-list">
              <li>🍖 Feed &amp; 😴 Rest keep Mood/Energy up.</li>
              <li>🎮 Play earns XP — but tires your pet.</li>
              <li>✨ Mint to own it on Sui, then Evolve as it levels.</li>
            </ul>
          </div>
        )}

        {lastTx && (
          <div className="receipt-strip" role="status">
            <span className="receipt-strip-badge">✅ On Sui testnet</span>
            <strong>{lastTx.label}</strong>
            <a href={explorerTxUrl(lastTx.digest)} target="_blank" rel="noreferrer">
              View tx ↗
            </a>
            {lastObject && (
              <a href={explorerObjectUrl(lastObject)} target="_blank" rel="noreferrer">
                Pet object ↗
              </a>
            )}
          </div>
        )}

        {isDemoPlaying && (
          <div className="demo-playing-pill" role="status">
            ▶ Playing demo (no wallet)
          </div>
        )}

        {showHud && (
        <aside className="hud-panel identity-hud game-online-hud">
          <div className="connected-pill">
            <span />
            {account?.address ? "connected" : "local mode"}
          </div>
          <div className="online-title">
            <span>ONLINE</span>
            <strong>{onlineCount}</strong>
          </div>
          <ul className="online-list">
            <li className="active">
              <span />
              <strong>{activeIdentity}</strong>
              <em>Lv {gameState.level}</em>
            </li>
            {mapFriends.slice(0, 6).map((friend) => (
              <li key={friend.id}>
                <span />
                {friend.name}
                <em>{friend.role}</em>
              </li>
            ))}
          </ul>
          <button className="friend-add-button" type="button" onClick={addMapFriend}>
            + friend plot
          </button>
          <div className="quick-bars">
            <div><span>XP</span><strong>{gameState.xp}</strong><i style={{ width: `${progress}%` }} /></div>
            <div><span>Mood</span><strong>{gameState.mood}</strong><i style={{ width: `${gameState.mood}%` }} /></div>
            <div><span>Energy</span><strong>{gameState.energy}</strong><i style={{ width: `${gameState.energy}%` }} /></div>
            <div><span>Lofi</span><strong>{account?.address ? walletLofiCount : ownedLofiNfts.length}</strong><i style={{ width: `${Math.min(100, (account?.address ? walletLofiCount : ownedLofiNfts.length) * 20)}%` }} /></div>
          </div>
          <div className="quest-chip">
            Map r{mapRevision} · {mapFriends.length} plots · {completedQuestCount}/{nameQuests.length} SuiNS
          </div>
        </aside>
        )}

        {showHud && (
        <button className="gallery-fab" type="button" onClick={() => setIsPetdexOpen(true)}>
          <Sparkles size={18} />
          Petdex
        </button>
        )}

        {showHud && (
        <aside className="hud-panel proof-hud game-chat-hud">
          <div className="chat-title">
            <span>CHAT</span>
            <strong><LinkIcon size={14} /> proof feed</strong>
          </div>
          <div className="messenger-log">
            {messengerMessages.slice(0, 5).map((entry, index) => (
              <div className="messenger-entry" key={`${entry.speaker}-${entry.message}-${index}`}>
                <strong>{entry.speaker}</strong>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
          <div className="receipt-stack">
            <div>
              <span>Walrus</span>
              <strong>{latestWalrusBlob || "No proof yet"}</strong>
            </div>
            <div>
              <span>Memory</span>
              <strong>{gameState.latestMemoryBlob ?? "No memory yet"}</strong>
            </div>
            {proofs.slice(0, 2).map((proof) => (
              <div key={`${proof.label}-${proof.value}`}>
                <span>{proof.label}</span>
                <strong>{proof.value}</strong>
              </div>
            ))}
          </div>
        </aside>
        )}

        {showHud && (
        <div className="install-card">
          <span>Install this pet</span>
          <strong>{petName}</strong>
          {activeLofiSource && (
            <ActiveLofiSourceCard
              item={activeLofiSource}
              feeSui={animationMintFeeSui}
              variant={activeLofiVariant}
              pack={activeGeneratedPack}
            />
          )}
          <a className="btn warn" href={activeGeneratedPack?.packageUrl ?? "/api/pets/lofi-yeti/package.zip"}>
            <Download size={16} />
            Pet pack
          </a>
          <Link href="/demo" className="btn secondary">
            <Archive size={16} />
            Demo
          </Link>
        </div>
        )}

        {worldMode === "arena" &&
          (arenaSnapshot.phase === "victory" || arenaSnapshot.phase === "failed" || arenaSnapshot.phase === "proof_saved") && (
          <div className="arena-result" role="dialog" aria-label="Run result">
            <div className="arena-result-card">
              <span className="arena-result-emoji">
                {(arenaSummary?.outcome ?? "failed") === "victory" ? "🏆" : "💥"}
              </span>
              <h3>
                {(arenaSummary?.outcome ?? "failed") === "victory"
                  ? "You survived 60s!"
                  : "Your pet was overwhelmed!"}
              </h3>
              <div className="arena-result-stats">
                <div><span>Score</span><strong>{arenaSummary?.score ?? arenaSnapshot.score}</strong></div>
                <div><span>Cleared</span><strong>{arenaSummary?.enemiesCleared ?? arenaSnapshot.enemiesCleared}</strong></div>
                <div><span>Snacks</span><strong>{arenaSummary?.snacksCollected ?? arenaSnapshot.snacksCollected}</strong></div>
              </div>
              <p className="arena-result-proof">
                {isSavingArenaProof
                  ? "Saving run proof to Walrus…"
                  : arenaSnapshot.phase === "proof_saved"
                  ? `✓ Run proof saved to Walrus${latestWalrusBlob ? ` · ${latestWalrusBlob.slice(0, 14)}…` : ""}`
                  : "Securing run proof…"}
              </p>
              <p className="arena-result-hint">Playing tired your pet out — head Home and Rest to recover energy.</p>
              <div className="arena-result-actions">
                <button className="btn" type="button" onClick={startArenaRun}>
                  <Sparkles size={16} />
                  Play again
                </button>
                <button className="btn secondary" type="button" onClick={() => setWorldMode("village")}>
                  <Moon size={16} />
                  Home &amp; rest
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`action-dock ${worldMode === "arena" ? "arena-dock" : ""} ${worldMode === "arena" && !arenaExpanded ? "arena-dock-collapsed" : ""} ${worldMode === "village" && careCollapsed ? "care-dock-collapsed" : ""}`}>
          {worldMode === "arena" ? (
            <div className="zone-action-card arena-action-card">
              <div className="arena-title-row">
                <span className="meaning-state">{arenaRunLabel[arenaSnapshot.phase]}</span>
                <h3>Play</h3>
                <strong>{arenaSecondsLeft}s</strong>
                <button
                  className="arena-collapse-btn"
                  type="button"
                  onClick={() => setArenaExpanded((value) => !value)}
                  title={arenaExpanded ? "Collapse panel" : "Expand panel"}
                  aria-expanded={arenaExpanded}
                >
                  {arenaExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
              {arenaExpanded && (
                <>
                  <p>Dodge enemies, grab snacks, survive 60s to boost your pet + earn an on-chain proof.</p>
                  <div className="arena-scoreboard">
                    <div><span>Score</span><strong>{arenaSnapshot.score}</strong></div>
                    <div><span>Snacks</span><strong>{arenaSnapshot.snacksCollected}</strong></div>
                    <div><span>Cleared</span><strong>{arenaSnapshot.enemiesCleared}</strong></div>
                    <div><span>Hits</span><strong>{arenaSnapshot.hitsTaken}</strong></div>
                  </div>
                  <div className="arena-meter-row">
                    <span>Safety</span>
                    <i><b style={{ width: `${Math.min(100, arenaSnapshot.safety)}%` }} /></i>
                    <strong>{arenaSnapshot.safety}%</strong>
                  </div>
                </>
              )}
              <div className="button-row">
                <button className="btn" type="button" onClick={startArenaRun} disabled={arenaSnapshot.phase === "running"}>
                  <Sparkles size={16} />
                  Start Run
                </button>
                {arenaExpanded && (
                  <>
                    <button className="btn secondary" type="button" onClick={runArenaCuddleAttack} disabled={arenaSnapshot.phase !== "running" || (!arenaSnapshot.cuddleReady && !arenaSnapshot.specialCharged)}>
                      <Brain size={16} />
                      {arenaSnapshot.specialCharged ? "Agent Special" : "Cuddle Attack"}
                    </button>
                    <button className="btn secondary" type="button" onClick={() => void runArenaAgentCharge()} disabled={isRunning || arenaSnapshot.phase !== "running"}>
                      <AlertTriangle size={16} />
                      Run Agent Charge
                    </button>
                    <button className="btn warn" type="button" onClick={() => void saveArenaProof()} disabled={!arenaSummary || isSavingArenaProof || arenaSnapshot.phase === "proof_saved"}>
                      <Upload size={16} />
                      Save Arena Proof
                    </button>
                    <button className="btn secondary" type="button" onClick={resetArenaRun}>
                      <Archive size={16} />
                      Replay
                    </button>
                  </>
                )}
              </div>
              {arenaExpanded && (arenaProofMessage || gameActionMessage || mintMessage || memoryMessage) && <p className="summary">{arenaProofMessage || gameActionMessage || mintMessage || memoryMessage}</p>}
              {arenaExpanded && arenaSummary && (
                <small>
                  {arenaSummary.outcome.toUpperCase()} receipt: {arenaSummary.score} score, {arenaSummary.enemiesCleared} cleared, {arenaSummary.snacksCollected} snacks.
                </small>
              )}
            </div>
          ) : (
            <div className={`zone-action-card care-panel ${careCollapsed ? "care-collapsed" : ""}`}>
              <div className="care-header">
                <h3>Care for {petName}</h3>
                <span className="pet-need-bubble">{petNeed.mood}</span>
                <button
                  className="arena-collapse-btn care-collapse-btn"
                  type="button"
                  onClick={() => setCareCollapsed((value) => !value)}
                  title={careCollapsed ? "Show more" : "Minimize"}
                  aria-expanded={!careCollapsed}
                >
                  {careCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              <p className="next-hint">→ {petNeed.hint}</p>
              <div className="care-row">
                <button
                  className={`btn ${!isMinted ? "is-locked" : ""}`}
                  type="button"
                  onClick={() => {
                    playSfx(isMinted ? "feed" : "click");
                    void runLocalGameAction("feed");
                  }}
                  title={isMinted ? "Feed: +mood +energy" : "Mint your pet first"}
                >
                  <Cookie size={20} />
                  Feed
                </button>
                <button
                  className={`btn ${!isMinted ? "is-locked" : ""}`}
                  type="button"
                  onClick={() => {
                    playSfx(isMinted ? "rest" : "click");
                    void runLocalGameAction("rest");
                  }}
                  title={isMinted ? "Rest: +energy" : "Mint your pet first"}
                >
                  <Moon size={20} />
                  Rest
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    playSfx("play");
                    setWorldMode("arena");
                  }}
                  title="Play the arcade mini-game"
                >
                  <Gamepad2 size={20} />
                  Play
                </button>
              </div>
              {!careCollapsed && (
                <label className="field-label compact-prompt">
                  AI task (optional)
                  <input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                </label>
              )}
              <div className="care-row secondary">
                {!careCollapsed && (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      playSfx("click");
                      void executeAgentRun();
                    }}
                    disabled={isRunning}
                    title="Run an AI agent task → earn XP + a Walrus proof"
                  >
                    <Brain size={16} />
                    Put to work
                  </button>
                )}
                {isMinted ? (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      playSfx("click");
                      void runLocalGameAction("evolve");
                    }}
                    disabled={!canEvolvePet(gameState)}
                    title={`Evolve at Lv ${evolutionRequiredLevel}`}
                  >
                    <Sparkles size={16} />
                    Evolve
                  </button>
                ) : (
                  <button
                    className="btn warn mint-cta"
                    type="button"
                    onClick={() => {
                      playSfx("click");
                      void mintLofiPet();
                    }}
                    disabled={isMinting}
                    title="Mint your pet on Sui"
                  >
                    <Sparkles size={16} />
                    {isMinting ? "Minting…" : "Mint to begin"}
                  </button>
                )}
              </div>
              {gameActionMessage && <p className="summary">{gameActionMessage}</p>}
            </div>
          )}

          {(worldMode === "arena" || !careCollapsed) && (
          <div className="dpad" aria-label="Village movement controls">
            <button
              className="action-button dpad-up"
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDpadHold("up");
              }}
              onPointerUp={() => stopDpadHold("up")}
              onPointerCancel={() => cancelDpadHold("up")}
              onPointerLeave={() => cancelDpadHold("up")}
              aria-label="Hold to move up"
            >
              <Navigation size={16} />
            </button>
            <button
              className="action-button"
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDpadHold("left");
              }}
              onPointerUp={() => stopDpadHold("left")}
              onPointerCancel={() => cancelDpadHold("left")}
              onPointerLeave={() => cancelDpadHold("left")}
              aria-label="Hold to move left"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              className="action-button"
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDpadHold("right");
              }}
              onPointerUp={() => stopDpadHold("right")}
              onPointerCancel={() => cancelDpadHold("right")}
              onPointerLeave={() => cancelDpadHold("right")}
              aria-label="Hold to move right"
            >
              <ArrowRight size={16} />
            </button>
            <button
              className="action-button dpad-down"
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDpadHold("down");
              }}
              onPointerUp={() => stopDpadHold("down")}
              onPointerCancel={() => cancelDpadHold("down")}
              onPointerLeave={() => cancelDpadHold("down")}
              aria-label="Hold to move down"
            >
              <Navigation size={16} />
            </button>
          </div>
          )}
        </div>

        <div className={`timeline-strip ${worldMode === "arena" ? "arena-timeline" : ""}`}>
          {timeline.map((item, index) => (
            <div className={`timeline-item ${index < activeStage ? "done" : ""} ${index === activeStage ? "active" : ""}`} key={`${item.label}-${index}`}>
              <span className="timeline-dot" />
              <div>
                <strong>{item.label}</strong>
                <div>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <form className="upload-form upload-flyout" onSubmit={uploadPack}>
          <h3>
            <Upload size={15} /> Upload animation pack
          </h3>
          <label className="field-label">
            pet.json
            <input type="file" name="petJson" accept=".json,application/json" required />
          </label>
          <label className="field-label">
            spritesheet.webp
            <input type="file" name="spritesheet" accept=".webp,image/webp" required />
          </label>
          <button className="btn secondary" type="submit">
            Validate + store proof
          </button>
          {uploadMessage && <p className="summary">{uploadMessage}</p>}
        </form>
      </section>

      {isPetdexOpen && (
        <div className="petdex-backdrop" role="dialog" aria-modal="true" aria-label="Petdex Gallery">
          <div className="petdex-modal">
            <div className="petdex-header">
              <div>
                <h2>Petdex Gallery</h2>
                <p className="panel-copy">
                  {account?.address
                    ? `Scanning ${shortAddress(account.address)} for Lofi/Yeti display NFTs.`
                    : "Connect wallet to scan address-owned Lofi NFTs; demo skins are shown in local mode."}
                </p>
              </div>
              <button className="action-button" type="button" onClick={() => setIsPetdexOpen(false)} aria-label="Close Petdex">
                <X size={16} />
                Close
              </button>
            </div>
            <form className="petdex-scan-form" onSubmit={scanOwnerForLofiNfts}>
              <label>
                Owner address
                <input
                  value={scanAddressInput}
                  onChange={(event) => setScanAddressInput(event.target.value)}
                  placeholder="0x... Sui owner address"
                  spellCheck={false}
                />
              </label>
              <button className="btn" type="submit" disabled={isLoadingLofiNfts}>
                {isLoadingLofiNfts ? "Scanning..." : "Scan address"}
              </button>
              {account?.address && (
                <button className="btn secondary" type="button" onClick={() => setScanAddressInput(account.address)}>
                  Use wallet
                </button>
              )}
            </form>
            {scanError && <p className="petdex-scan-error">{scanError}</p>}
            <div className="petdex-grid">
              <div className="petdex-card active">
                <span className="nft-thumb">
                  <img src="/pets/lofi-yeti/source-logo.png" alt="" />
                </span>
                <strong>{petName}</strong>
                <span>{isMinted ? "Owned companion" : "Template ready"}</span>
                <small>{isNameEquipped ? `Equipped to ${activeIdentity}` : "Equip it at SuiNS Gate"}</small>
              </div>
              {isLoadingLofiNfts && (
                <div className="petdex-card petdex-empty-card">
                  <strong>Scanning wallet...</strong>
                  <span>Reading Sui display objects</span>
                  <small>Looking for Lofi/Yeti/CLAY metadata on this address.</small>
                </div>
              )}
              {!isLoadingLofiNfts && ownedLofiNfts.length === 0 && (
                <div className="petdex-card petdex-empty-card">
                  <strong>No Lofi NFT found</strong>
                  <span>{shortAddress(owner)}</span>
                  <small>Add official collection type filters later, or mint/equip the default animated pack.</small>
                </div>
              )}
              {!isLoadingLofiNfts &&
                ownedLofiNfts.map((nft) => (
                  <button
                    className={`petdex-card nft-card ${petId === nft.objectId ? "active" : ""}`}
                    type="button"
                    key={nft.objectId}
                    onClick={() => equipOwnedLofiNft(nft)}
                  >
                    <span className="nft-thumb">
                      {nft.imageUrl ? <img src={nft.imageUrl} alt="" /> : <PetSprite state="idle" scale={0.42} />}
                    </span>
                    <strong>{nft.name}</strong>
                    <span>{nft.source === "wallet" ? "Wallet Lofi NFT" : "Demo Lofi skin"}</span>
                    <small>{nft.description || nft.type}</small>
                  </button>
                ))}
            </div>
            <div className="petdex-section">
              <h3>Address Lofi Scan</h3>
              <p className="panel-copy petdex-dark-copy">
                {lastScannedAddress
                  ? `${ownedLofiNfts.length} Lofi/Yeti-like NFT${ownedLofiNfts.length === 1 ? "" : "s"} matched from ${shortAddress(lastScannedAddress)}. Matching uses display name, description, image URL, and type until the official Lofi collection/package filters are configured.`
                  : "Local mode shows demo skins. Paste any Sui owner address or connect a wallet to list real Sui objects owned by that address."}
              </p>
            </div>
            <div className="petdex-section">
              <h3>
                <Palette size={16} /> Choose a look
              </h3>
              <p className="panel-copy petdex-dark-copy">
                Pick a vivid preset to instantly re-skin your companion. Great for telling pets apart at a glance.
              </p>
              <div className="avatar-presets">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`avatar-swatch${activeAvatarPresetId === preset.id ? " active" : ""}`}
                    onClick={() => {
                      sendGameCommand({
                        type: "setPetVariant",
                        variant: {
                          id: preset.id,
                          name: preset.name,
                          tintHex: preset.tintHex,
                          accentHex: preset.accentHex
                        }
                      });
                      setPetName(preset.name);
                      setGameActionMessage(`${preset.name} look applied.`);
                      setActiveAvatarPresetId(preset.id);
                      playSfx("click");
                    }}
                    title={`${preset.name} look`}
                  >
                    <span className="avatar-swatch-colors">
                      <span style={{ background: hexNumberToCss(preset.tintHex) }} />
                      <span style={{ background: hexNumberToCss(preset.accentHex) }} />
                    </span>
                    <span className="avatar-swatch-name">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="petdex-section lofi-market-section">
              <div className="petdex-section-header">
                <div>
                  <h3>Official Lofi Market Crawl</h3>
                  <p className="panel-copy petdex-dark-copy">
                    Crawl TradePort for the Lofi collection, read pre-generated top-10 atlas packs, and equip ready NFT-to-atlas companions. Queued items keep the real portrait plus shared preview rig until their full 8x9 pack is created by the offline hatch-pet pipeline.
                  </p>
                </div>
                <div className="market-actions">
                  <a className="btn secondary compact-link" href={LOFI_TRADEPORT_URL} target="_blank" rel="noreferrer">
                    TradePort
                  </a>
                  <button className="btn" type="button" onClick={() => void loadTradeportTopLofi(true)} disabled={isLoadingMarket}>
                    {isLoadingMarket ? "Crawling..." : "Crawl top 10"}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => void loadGeneratedLofiPacks(activeLofiSource?.tokenId ?? null, true)} disabled={isGeneratingLofiPacks}>
                    {isGeneratingLofiPacks ? "Reading..." : "Read status"}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => showOfflineGenerationNote(activeLofiSource?.tokenId ?? null)}>
                    Offline gen
                  </button>
                </div>
              </div>
              {lofiGeneratedPacks.length > 0 ? (
                <div className="animated-roster-callout">
                  <strong>
                    {lofiGeneratedPacks.filter(isRealGeneratedPack).length} real ready · {lofiGeneratedPacks.filter((pack) => pack.status === "preview").length} fallback preview · {lofiGeneratedPacks.filter((pack) => pack.status === "queued").length} queued
                  </strong>
                  <span>Only real/refined packs equip as unique spritesheets; fallback previews stay visibly temporary until source art resolves.</span>
                </div>
              ) : lofiAnimationRoster.length > 0 && (
                <div className="animated-roster-callout">
                  <strong>{lofiAnimationRoster.length} shared preview rigs ready</strong>
                  <span>Run the offline hatch-pet generation pipeline for highest-price, rarest, and selected NFTs, then click Read status to equip real image-backed packs.</span>
                </div>
              )}
              <div className="market-summary-grid">
                <div>
                  <span>Collection</span>
                  <strong>{lofiMarket?.collection.supply ?? 358} NFTs</strong>
                </div>
                <div>
                  <span>Floor</span>
                  <strong>{lofiMarket?.collection.floorSui ?? "10"} SUI</strong>
                </div>
                <div>
                  <span>Animation pass</span>
                  <strong>{animationMintFeeSui} SUI</strong>
                </div>
                <div>
                  <span>Fetched</span>
                  <strong>{lofiMarket ? new Date(lofiMarket.fetchedAt).toLocaleTimeString() : "Not yet"}</strong>
                </div>
              </div>
              {(marketError || generatedPackError) && <p className="petdex-scan-error inline-error">{marketError || generatedPackError}</p>}
              <div className="market-tabs" aria-label="Lofi market crawl mode">
                <button className={marketMode === "price" ? "active" : ""} type="button" onClick={() => setMarketMode("price")}>
                  <Coins size={14} />
                  Most expensive
                </button>
                <button className={marketMode === "rarity" ? "active" : ""} type="button" onClick={() => setMarketMode("rarity")}>
                  <Sparkles size={14} />
                  Rarest ranking
                </button>
              </div>
              <div className="market-grid">
                {isLoadingMarket && selectedMarketItems.length === 0 && (
                  <div className="market-empty">
                    <strong>Crawling TradePort...</strong>
                    <span>Reading live listings, rarity ranks, owners, prices, and IPFS art.</span>
                  </div>
                )}
                {!isLoadingMarket && selectedMarketItems.length === 0 && (
                  <div className="market-empty">
                    <strong>No crawl data yet</strong>
                    <span>Press Crawl top 10 to fetch official Lofi NFTs from TradePort.</span>
                  </div>
                )}
                {selectedMarketItems.map((item, index) => {
                  const isOwnedByCurrentWallet = Boolean(
                    account?.address && item.owner && item.owner.toLowerCase() === account.address.toLowerCase()
                  );
                  const priceText = item.priceSui ? `${item.priceSui} SUI` : "Not listed";
                  const variant = lofiAnimationRoster.find((candidate) => candidate.tokenId === item.tokenId);
                  const pack = lofiGeneratedPacks.find((candidate) => candidate.tokenId === item.tokenId);

                  return (
                    <button
                      className={`market-card ${activeLofiVariant?.tokenId === item.tokenId || activeGeneratedPack?.tokenId === item.tokenId ? "active" : ""}`}
                      type="button"
                      key={`${marketMode}-${item.id}`}
                      onClick={() => void requestAnimationMintPass(item)}
                    >
                      <span className="market-rank">#{index + 1}</span>
                      <MarketLofiThumb imageUrl={item.imageUrl} variant={variant} pack={pack} />
                      <strong>{item.name}</strong>
                      <span className={`pack-status ${packStatusClass(pack, variant)}`}>
                        {isOwnedByCurrentWallet ? "Owned ✓" : "Preview skin"}
                      </span>
                      <span className="market-line">
                        <b>Rank</b>
                        {item.ranking ? `#${item.ranking}` : "unknown"}
                      </span>
                      <span className="market-line">
                        <b>{marketMode === "price" ? "Price" : "List"}</b>
                        {priceText}
                      </span>
                      <span className="market-line">
                        <b>Owner</b>
                        {shortObjectId(item.owner)}
                      </span>
                      <small>
                        {isOwnedByCurrentWallet
                          ? "You own this — click to equip"
                          : "Click to try as a preview skin"}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="petdex-section">
              <h3>Animation Meaning</h3>
              <div className="petdex-meaning-grid">
                {ANIMATION_MEANINGS.map((meaning, index) => (
                  <button
                    className={`petdex-meaning-card ${petState === meaning.state ? "active" : ""}`}
                    type="button"
                    key={meaning.state}
                    onClick={() => previewAnimation(meaning)}
                  >
                    <span>{index + 1}</span>
                    <strong>{meaning.state}</strong>
                    <small>{meaning.useCase}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <OnboardingOverlay
          onWatchDemo={() => {
            setShowOnboarding(false);
            window.localStorage.setItem("petlofi_onboarded", "1");
            void runGuidedDemo();
          }}
          onClose={() => {
            setShowOnboarding(false);
            window.localStorage.setItem("petlofi_onboarded", "1");
          }}
        />
      )}
    </main>
  );
}

function mergeProofEntries(current: ProofEntry[], entries: ProofEntry[]): ProofEntry[] {
  const labels = new Set(entries.map((entry) => entry.label));
  return [...entries, ...current.filter((entry) => !labels.has(entry.label))];
}

async function loadOwnedLofiObjects(suiClient: SuiObjectScanner, ownerAddress: string) {
  const objects: unknown[] = [];
  let cursor: string | null | undefined;

  for (let page = 0; page < OWNED_OBJECT_MAX_PAGES; page += 1) {
    const response = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      cursor,
      limit: OWNED_OBJECT_PAGE_LIMIT,
      options: {
        showContent: true,
        showDisplay: true,
        showType: true
      }
    });

    objects.push(...response.data);

    if (!response.hasNextPage || !response.nextCursor) {
      break;
    }

    cursor = response.nextCursor;
  }

  return {
    objectCount: objects.length,
    lofiNfts: extractOwnedLofiNfts(objects)
  };
}

function extractOwnedLofiNfts(objects: unknown[]): OwnedLofiNft[] {
  const seen = new Set<string>();
  return objects
    .map(ownedObjectToLofiNft)
    .filter((nft): nft is OwnedLofiNft => Boolean(nft))
    .filter((nft) => {
      if (seen.has(nft.objectId)) {
        return false;
      }

      seen.add(nft.objectId);
      return true;
    });
}

function ownedObjectToLofiNft(object: unknown): OwnedLofiNft | null {
  const objectRecord = asRecord(object);
  const data = asRecord(objectRecord?.data);
  const display = asRecord(asRecord(data?.display)?.data);
  const content = asRecord(data?.content);
  const contentFields = asRecord(content?.fields);
  const nestedMetadata = asRecord(contentFields?.metadata);

  const objectId = readString(data, "objectId") ?? "";
  const type = readString(data, "type") ?? readString(content, "type") ?? "";
  const name =
    readString(display, "name") ??
    readString(contentFields, "name") ??
    readString(nestedMetadata, "name") ??
    shortAddress(objectId || type || "unknown");
  const description =
    readString(display, "description") ??
    readString(contentFields, "description") ??
    readString(nestedMetadata, "description") ??
    type;
  const imageUrl = normalizeNftImageUrl(
    readString(display, "image_url") ??
      readString(display, "image") ??
      readString(display, "url") ??
      readString(contentFields, "image_url") ??
      readString(contentFields, "image") ??
      readString(contentFields, "url") ??
      readString(nestedMetadata, "image_url") ??
      readString(nestedMetadata, "image") ??
      ""
  );

  const haystack = `${name} ${description} ${imageUrl} ${type}`.toLowerCase();
  const matchesKeyword = LOFI_NFT_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const matchesType = LOFI_NFT_TYPE_FILTERS.some((filter) => type.toLowerCase().includes(filter));

  if (!objectId || (!matchesKeyword && !matchesType)) {
    return null;
  }

  return {
    objectId,
    type,
    name,
    description,
    imageUrl,
    source: "wallet"
  };
}

function MarketLofiThumb({
  imageUrl,
  variant,
  pack
}: {
  imageUrl: string;
  variant?: LofiAnimationVariant | null;
  pack?: LofiGeneratedPetPack | null;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const readySrc = pack && isRealGeneratedPack(pack) ? pack.spritesheetUrl : undefined;
  const previewSrc = pack?.status === "preview" ? pack.spritesheetUrl : undefined;
  const isFallbackAtlas = pack?.status === "preview";
  const spriteSrc = readySrc ?? previewSrc;

  return (
    <span
      className={`market-thumb ${variant || spriteSrc ? "has-animation" : ""} ${readySrc ? "has-ready-atlas" : ""} ${
        isFallbackAtlas ? "has-fallback-atlas" : ""
      }`}
    >
      <span className="market-fallback">
        <PetSprite state={spriteSrc || variant ? "waving" : "idle"} src={spriteSrc} scale={0.34} hue={spriteSrc ? 0 : variant?.hue ?? 0} />
      </span>
      {imageUrl && (
        <img
          className={isLoaded ? "loaded" : ""}
          src={imageUrl}
          alt=""
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(false)}
        />
      )}
      {spriteSrc ? (
        <span className={`market-rig-preview ${readySrc ? "ready" : "preview"} ${isFallbackAtlas ? "fallback" : ""}`}>
          <PetSprite state="running" src={spriteSrc} scale={0.22} />
        </span>
      ) : variant && (
        <span className="market-rig-preview">
          <PetSprite state="running" scale={0.22} hue={variant.hue} />
        </span>
      )}
    </span>
  );
}

function ActiveLofiSourceCard({
  item,
  feeSui,
  variant,
  pack
}: {
  item: TradeportLofiItem;
  feeSui: string;
  variant?: LofiAnimationVariant | null;
  pack?: LofiGeneratedPetPack | null;
}) {
  const listingCopy = item.priceSui ? `listed ${item.priceSui} SUI · ` : "";

  return (
    <div className="active-lofi-source">
      <MarketLofiThumb imageUrl={item.imageUrl} variant={variant} pack={pack} />
      <div>
        <span>
          {pack && isRealGeneratedPack(pack)
            ? pack.generationMode === "hatch-refined"
              ? "Active refined atlas"
              : "Active real atlas"
            : pack?.status === "preview"
              ? "Preview fallback"
            : variant
              ? "Active preview"
              : "Animation source"}
        </span>
        <strong>{item.name}</strong>
        <small>
          rank {item.ranking ? `#${item.ranking}` : "unknown"} · {listingCopy}
          {pack && isRealGeneratedPack(pack)
            ? `${pack.generationMode === "hatch-refined" ? "hatch-refined" : "NFT-to-atlas"} equipped`
            : pack?.status === "preview"
              ? "fallback preview only"
            : variant
              ? "shared preview rig"
              : `pass ${feeSui} SUI`}
        </small>
      </div>
    </div>
  );
}

function generatedPackLabel(pack: LofiGeneratedPetPack) {
  if (isRealGeneratedPack(pack)) {
    return pack.generationMode === "hatch-refined" ? "Ready refined" : "Ready real";
  }

  if (pack.status === "preview") {
    return "Preview fallback";
  }

  return "Queued";
}

function packStatusClass(pack?: LofiGeneratedPetPack | null, variant?: LofiAnimationVariant | null) {
  if (pack && isRealGeneratedPack(pack)) {
    return "ready";
  }

  if (pack?.status === "preview" || variant) {
    return "preview";
  }

  return "queued";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNftImageUrl(url: string): string {
  if (!url) {
    return "";
  }

  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`;
  }

  if (url.startsWith("ar://")) {
    return `https://arweave.net/${url.slice("ar://".length)}`;
  }

  return url;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
