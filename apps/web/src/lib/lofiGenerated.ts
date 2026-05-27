import type { TradeportLofiItem, TradeportLofiTopResponse } from "./lofiMarket";

export type LofiGeneratedPetPackStatus = "ready" | "queued" | "preview";
export type LofiGeneratedPetPackSourceMode = "nft-image" | "metadata-fallback";
export type LofiGeneratedPetPackSourceOrigin = "local-cache" | "tradeport-media" | "ipfs-gateway" | "metadata-fallback";
export type LofiGeneratedPetPackGenerationMode = "deterministic" | "hatch-refined";
export type LofiGenerationRequestMode = "batchA" | "selected" | "top10";

export type LofiGeneratedPetPack = {
  tokenId: string;
  name: string;
  imageUrl: string;
  rank: number | null;
  priceSui: string | null;
  status: LofiGeneratedPetPackStatus;
  petJsonUrl: string;
  spritesheetUrl: string;
  packageUrl: string;
  generatedAt: string | null;
  packId: string;
  owner: string | null;
  sourceUrl: string;
  packHash?: string;
  sourceImageHash?: string;
  sourceMode?: LofiGeneratedPetPackSourceMode;
  sourceOrigin?: LofiGeneratedPetPackSourceOrigin;
  generationMode?: LofiGeneratedPetPackGenerationMode;
  sourceNote?: string;
  warning?: string;
  lastGeneratedAt?: string;
  batch: "A" | "B";
};

export type LofiGeneratedResponse = {
  fetchedAt: string;
  generatedAt: string;
  packs: LofiGeneratedPetPack[];
  readyCount: number;
  queuedCount: number;
  previewCount: number;
  warning?: string;
};

export type LofiGenerationRequest = {
  mode: LofiGenerationRequestMode;
  selectedTokenId?: string | null;
  refine?: boolean;
};

export function buildTop10GeneratedPacks(
  top: TradeportLofiTopResponse,
  selectedTokenId?: string | null,
  _generatedAt = new Date().toISOString()
): LofiGeneratedPetPack[] {
  const uniqueCandidates = uniqueByToken([...top.mostExpensive, ...top.rarest]);
  const selected = selectedTokenId
    ? uniqueCandidates.find((item) => item.tokenId === selectedTokenId || item.id === selectedTokenId)
    : null;
  const batchA = uniqueByToken([top.mostExpensive[0], top.rarest[0], selected, ...uniqueCandidates]).slice(0, 3);
  const top10 = uniqueByToken([...batchA, ...uniqueCandidates]).slice(0, 10);
  const batchATokens = new Set(batchA.map((item) => item.tokenId));

  return top10.map((item) => {
    const packId = lofiGeneratedPackId(item);
    const isBatchA = batchATokens.has(item.tokenId);
    return {
      tokenId: item.tokenId,
      name: item.name,
      imageUrl: item.imageUrl,
      rank: item.ranking,
      priceSui: item.priceSui,
      status: "queued",
      petJsonUrl: `/pets/${packId}/pet.json`,
      spritesheetUrl: `/pets/${packId}/spritesheet.webp`,
      packageUrl: `/api/pets/${packId}/package.zip`,
      generatedAt: null,
      packId,
      owner: item.owner,
      sourceUrl: item.sourceUrl,
      batch: isBatchA ? "A" : "B"
    };
  });
}

export function isRealGeneratedPack(pack: Pick<LofiGeneratedPetPack, "status" | "sourceOrigin" | "sourceMode">) {
  return pack.status === "ready" && pack.sourceOrigin !== "metadata-fallback" && pack.sourceMode !== "metadata-fallback";
}

export function countGeneratedPacks(packs: LofiGeneratedPetPack[]) {
  return {
    readyCount: packs.filter(isRealGeneratedPack).length,
    queuedCount: packs.filter((pack) => pack.status === "queued").length,
    previewCount: packs.filter((pack) => pack.status === "preview").length
  };
}

export function lofiGeneratedPackId(item: Pick<TradeportLofiItem, "name" | "tokenId" | "id">) {
  const nameSlug = slugify(item.name || "lofi-nft");
  return `${nameSlug}-${stableShortHash(item.tokenId || item.id)}`;
}

export function uniqueByToken(items: Array<TradeportLofiItem | null | undefined>) {
  const seen = new Set<string>();
  const unique: TradeportLofiItem[] = [];
  items.forEach((item) => {
    if (!item) {
      return;
    }
    const key = item.tokenId || item.id;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 46);
  return slug || "lofi-nft";
}

function stableShortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}
