import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  type LofiGeneratedPetPack,
  type LofiGeneratedPetPackGenerationMode,
  type LofiGeneratedPetPackSourceOrigin,
  type LofiGeneratedResponse,
  buildTop10GeneratedPacks,
  countGeneratedPacks
} from "@/lib/lofiGenerated";
import type { TradeportLofiTopResponse } from "@/lib/lofiMarket";
import { validateSpriteAtlas } from "@/lib/petPack";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const packs = await buildManifest(request, requestSelectedToken(request.url));
    return NextResponse.json(toResponsePayload(packs.top.fetchedAt, packs.manifest, packs.top.warning));
  } catch (error) {
    return generatedErrorResponse(error);
  }
}

export async function POST() {
  return NextResponse.json(
    {
      fetchedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      packs: [],
      readyCount: 0,
      queuedCount: 0,
      previewCount: 0,
      warning:
        "On-demand pack generation is disabled on the Cloudflare Workers deployment. Pre-generated packs are served from /pets/. Run generation locally with the Node-based pipeline."
    } satisfies LofiGeneratedResponse,
    { status: 501 }
  );
}

async function buildManifest(request: Request, selectedTokenId?: string | null) {
  const top = await fetchTopLofi(request.url);
  const base = buildTop10GeneratedPacks(top, selectedTokenId);
  const manifest = await Promise.all(base.map((pack) => readGeneratedPackStatus(pack, request.url)));
  return { top, manifest };
}

function toResponsePayload(fetchedAt: string, packs: LofiGeneratedPetPack[], warning?: string): LofiGeneratedResponse {
  return {
    fetchedAt,
    generatedAt: new Date().toISOString(),
    packs,
    ...countGeneratedPacks(packs),
    warning: warning || undefined
  };
}

function generatedErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      fetchedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      packs: [],
      readyCount: 0,
      queuedCount: 0,
      previewCount: 0,
      warning: error instanceof Error ? error.message : "Generated Lofi manifest failed"
    } satisfies LofiGeneratedResponse,
    { status: 200 }
  );
}

function requestSelectedToken(requestUrl: string) {
  return new URL(requestUrl).searchParams.get("selected");
}

async function fetchTopLofi(requestUrl: string): Promise<TradeportLofiTopResponse> {
  const topUrl = new URL("/api/lofi/top", requestUrl);
  const response = await fetch(topUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as TradeportLofiTopResponse;
}

async function readGeneratedPackStatus(pack: LofiGeneratedPetPack, requestUrl: string): Promise<LofiGeneratedPetPack> {
  const petJson = await fetchPetJson(pack.packId, requestUrl);
  if (!petJson) {
    return pack;
  }

  const spritesheet = await fetchSpritesheet(pack.packId, requestUrl);
  if (!spritesheet) {
    return pack;
  }

  try {
    validateSpriteAtlas(spritesheet);
  } catch {
    return pack;
  }

  const sourceOrigin = readSourceOrigin(petJson);
  const generationMode = readGenerationMode(petJson);
  const packHash = createHash("sha256").update(spritesheet).digest("hex");
  const warning = normalizeStoredWarning(sourceOrigin, readString(petJson, "warning") ?? readString(petJson, "sourceNote"));
  const lastGeneratedAt = readString(petJson, "lastGeneratedAt") ?? pack.generatedAt ?? null;
  const sourceImageHash = readString(petJson, "sourceImageHash") ?? undefined;

  return {
    ...pack,
    status: sourceOrigin === "metadata-fallback" ? "preview" : "ready",
    generatedAt: lastGeneratedAt,
    lastGeneratedAt: lastGeneratedAt ?? undefined,
    packHash,
    sourceImageHash,
    sourceOrigin,
    sourceMode: sourceOrigin === "metadata-fallback" ? "metadata-fallback" : "nft-image",
    generationMode,
    warning
  };
}

async function fetchPetJson(packId: string, requestUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const url = new URL(`/pets/${packId}/pet.json`, requestUrl);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchSpritesheet(packId: string, requestUrl: string): Promise<Uint8Array | null> {
  try {
    const url = new URL(`/pets/${packId}/spritesheet.webp`, requestUrl);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function readSourceOrigin(record: Record<string, unknown> | null): LofiGeneratedPetPackSourceOrigin {
  const sourceOrigin = readString(record, "sourceOrigin");
  if (
    sourceOrigin === "local-cache" ||
    sourceOrigin === "tradeport-media" ||
    sourceOrigin === "ipfs-gateway" ||
    sourceOrigin === "metadata-fallback"
  ) {
    return sourceOrigin;
  }
  return record?.sourceMode === "metadata-fallback" ? "metadata-fallback" : "local-cache";
}

function readGenerationMode(record: Record<string, unknown> | null): LofiGeneratedPetPackGenerationMode {
  return record?.generationMode === "hatch-refined" ? "hatch-refined" : "deterministic";
}

function normalizeStoredWarning(sourceOrigin: LofiGeneratedPetPackSourceOrigin, warning: string | null) {
  if (sourceOrigin === "metadata-fallback") {
    return "NFT source image unavailable across configured gateways; generated fallback preview only.";
  }
  return warning ?? undefined;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
