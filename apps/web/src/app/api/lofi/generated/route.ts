import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  type LofiGeneratedPetPack,
  type LofiGeneratedPetPackGenerationMode,
  type LofiGeneratedPetPackSourceOrigin,
  type LofiGeneratedResponse,
  type LofiGenerationRequest,
  buildTop10GeneratedPacks,
  countGeneratedPacks
} from "@/lib/lofiGenerated";
import type { TradeportLofiTopResponse } from "@/lib/lofiMarket";
import { PET_CELL, PET_STATES, validateSpriteAtlas } from "@/lib/petPack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_IMAGE_NAME = "source-image";
const SOURCE_IMAGE_PNG_NAME = "source-image.png";
const SOURCE_FALLBACK_NAME = "source-fallback.png";

type ResolvedSourceImage = {
  buffer: Buffer;
  sourceOrigin: LofiGeneratedPetPackSourceOrigin;
};

const CELL_BACKGROUND = {
  idle: "#f8f9df",
  "running-right": "#d8f7e0",
  "running-left": "#d8f7e0",
  waving: "#fff0b8",
  jumping: "#dff7ff",
  failed: "#f7d7dc",
  waiting: "#eee6ff",
  running: "#e1f5dc",
  review: "#e7efff"
} as const;

export async function GET(request: Request) {
  try {
    const packs = await buildManifest(request, requestSelectedToken(request.url));
    return NextResponse.json(toResponsePayload(packs.top.fetchedAt, packs.manifest, packs.top.warning));
  } catch (error) {
    return generatedErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readGenerationRequest(request);
    const packs = await buildManifest(request, body.selectedTokenId);
    const targets = selectGenerationTargets(packs.manifest, body);
    const targetTokens = new Set(targets.map((pack) => pack.tokenId));
    const warnings: string[] = [];

    const generated = await Promise.all(
      packs.manifest.map(async (pack) => {
        if (!targetTokens.has(pack.tokenId)) {
          return pack;
        }

        try {
          const staged = await ensureGeneratedPack(pack, { refine: Boolean(body.refine) });
          if (staged.warning) {
            warnings.push(`${staged.name}: ${staged.warning}`);
          }
          return staged;
        } catch (error) {
          const warning = error instanceof Error ? error.message : "generation failed";
          warnings.push(`${pack.name}: ${warning}`);
          return { ...pack, status: "queued" as const, warning };
        }
      })
    );

    return NextResponse.json(toResponsePayload(packs.top.fetchedAt, generated, warnings.join("; ") || packs.top.warning));
  } catch (error) {
    return generatedErrorResponse(error);
  }
}

async function buildManifest(request: Request, selectedTokenId?: string | null) {
  const top = await fetchTopLofi(request.url);
  const base = buildTop10GeneratedPacks(top, selectedTokenId);
  const manifest = await Promise.all(base.map((pack) => readGeneratedPackStatus(pack)));
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

async function readGenerationRequest(request: Request): Promise<LofiGenerationRequest> {
  const body = (await request.json().catch(() => ({}))) as Partial<LofiGenerationRequest>;
  const mode = body.mode === "selected" || body.mode === "top10" || body.mode === "batchA" ? body.mode : "batchA";
  return {
    mode,
    selectedTokenId: typeof body.selectedTokenId === "string" ? body.selectedTokenId : null,
    refine: Boolean(body.refine)
  };
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

function selectGenerationTargets(packs: LofiGeneratedPetPack[], request: LofiGenerationRequest) {
  if (request.mode === "top10") {
    return packs;
  }

  if (request.mode === "selected" && request.selectedTokenId) {
    return packs.filter((pack) => pack.tokenId === request.selectedTokenId);
  }

  return packs.filter((pack) => pack.batch === "A");
}

async function readGeneratedPackStatus(pack: LofiGeneratedPetPack): Promise<LofiGeneratedPetPack> {
  const petDir = packDir(pack.packId);
  const spritePath = path.join(petDir, "spritesheet.webp");
  const petJsonPath = path.join(petDir, "pet.json");

  if (!(await exists(spritePath)) || !(await exists(petJsonPath))) {
    return pack;
  }

  const petJson = await readPetJson(petJsonPath);
  const sourceOrigin = readSourceOrigin(petJson);
  const generationMode = readGenerationMode(petJson);
  const spritesheet = await fs.readFile(spritePath);
  validateSpriteAtlas(spritesheet);
  const packHash = createHash("sha256").update(spritesheet).digest("hex");
  const warning = normalizeStoredWarning(sourceOrigin, readString(petJson, "warning") ?? readString(petJson, "sourceNote"));
  const lastGeneratedAt = readString(petJson, "lastGeneratedAt") ?? pack.generatedAt ?? null;
  const sourceImageHash = readString(petJson, "sourceImageHash") ?? (await sourceImageHashFromDisk(petDir));

  return {
    ...pack,
    status: sourceOrigin === "metadata-fallback" ? "preview" : "ready",
    generatedAt: lastGeneratedAt,
    lastGeneratedAt: lastGeneratedAt ?? undefined,
    packHash,
    sourceImageHash: sourceImageHash ?? undefined,
    sourceOrigin,
    sourceMode: sourceOrigin === "metadata-fallback" ? "metadata-fallback" : "nft-image",
    generationMode,
    warning
  };
}

async function ensureGeneratedPack(
  pack: LofiGeneratedPetPack,
  options: { refine: boolean }
): Promise<LofiGeneratedPetPack> {
  const petDir = packDir(pack.packId);
  const spritePath = path.join(petDir, "spritesheet.webp");
  const petJsonPath = path.join(petDir, "pet.json");
  const contactSheetPath = path.join(petDir, "contact-sheet.webp");
  await fs.mkdir(petDir, { recursive: true });

  const source = await resolveSourceImage(pack, petDir);
  const lastGeneratedAt = new Date().toISOString();
  const generationMode = await resolveGenerationMode(petDir, options.refine);
  const warning =
    source.sourceOrigin === "metadata-fallback"
      ? "NFT source image unavailable across configured gateways; generated fallback preview only."
      : options.refine && generationMode !== "hatch-refined"
        ? "Hatch-pet refinement was requested, but no refined spritesheet was present; generated deterministic atlas."
        : undefined;

  if (generationMode === "hatch-refined") {
    await fs.copyFile(path.join(petDir, "refined-spritesheet.webp"), spritePath);
  } else {
    await createNftAtlas(source.buffer, spritePath);
  }

  await createContactSheet(spritePath, contactSheetPath);
  const spritesheet = await fs.readFile(spritePath);
  validateSpriteAtlas(spritesheet);
  const packHash = createHash("sha256").update(spritesheet).digest("hex");
  const sourceImageHash = createHash("sha256").update(source.buffer).digest("hex");

  await fs.writeFile(
    petJsonPath,
    `${JSON.stringify(
      {
        id: pack.packId,
        displayName: pack.name,
        description:
          source.sourceOrigin === "metadata-fallback"
            ? `${pack.name} fallback preview atlas staged from token metadata because source NFT art was unavailable.`
            : `${pack.name} staged NFT-to-atlas companion generated from official Lofi NFT source art for PetLofi Cuddle Arena.`,
        spritesheetPath: "spritesheet.webp",
        referenceUrl: pack.sourceUrl,
        sourceImageUrl: pack.imageUrl,
        sourceTokenId: pack.tokenId,
        sourceOrigin: source.sourceOrigin,
        sourceMode: source.sourceOrigin === "metadata-fallback" ? "metadata-fallback" : "nft-image",
        sourceImageHash,
        generationMode,
        hatchRun: "petlofi-top10-staged",
        packHash,
        warning,
        lastGeneratedAt,
        states: PET_STATES
      },
      null,
      2
    )}\n`
  );

  return {
    ...pack,
    status: source.sourceOrigin === "metadata-fallback" ? "preview" : "ready",
    generatedAt: lastGeneratedAt,
    lastGeneratedAt,
    packHash,
    sourceImageHash,
    sourceOrigin: source.sourceOrigin,
    sourceMode: source.sourceOrigin === "metadata-fallback" ? "metadata-fallback" : "nft-image",
    generationMode,
    warning
  };
}

async function resolveGenerationMode(petDir: string, refine: boolean): Promise<LofiGeneratedPetPackGenerationMode> {
  if (refine && (await exists(path.join(petDir, "refined-spritesheet.webp")))) {
    return "hatch-refined";
  }
  return "deterministic";
}

async function resolveSourceImage(pack: LofiGeneratedPetPack, petDir: string): Promise<ResolvedSourceImage> {
  const cached = await readCachedSourceImage(petDir);
  if (cached) {
    return { ...cached, sourceOrigin: "local-cache" as const };
  }

  try {
    const fetched = await fetchImage(pack.imageUrl);
    await fs.writeFile(path.join(petDir, SOURCE_IMAGE_NAME), fetched.buffer);
    await fs.writeFile(path.join(petDir, SOURCE_IMAGE_PNG_NAME), fetched.buffer);
    return fetched;
  } catch {
    const buffer = await createFallbackSourceImage(pack);
    await fs.writeFile(path.join(petDir, SOURCE_FALLBACK_NAME), buffer);
    return { buffer, sourceOrigin: "metadata-fallback" as const };
  }
}

async function readCachedSourceImage(petDir: string) {
  for (const name of [SOURCE_IMAGE_PNG_NAME, SOURCE_IMAGE_NAME]) {
    const filePath = path.join(petDir, name);
    if (!(await exists(filePath))) {
      continue;
    }
    const buffer = await fs.readFile(filePath);
    await sharp(buffer).metadata();
    return { buffer };
  }
  return null;
}

async function sourceImageHashFromDisk(petDir: string) {
  for (const name of [SOURCE_IMAGE_PNG_NAME, SOURCE_IMAGE_NAME, SOURCE_FALLBACK_NAME]) {
    const filePath = path.join(petDir, name);
    if (await exists(filePath)) {
      return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
    }
  }
  return null;
}

async function fetchImage(imageUrl: string): Promise<ResolvedSourceImage> {
  if (!imageUrl) {
    throw new Error("missing NFT image URL");
  }

  const [tradeport, ...gateways] = imageCandidates(imageUrl);
  const tradeportResult = await fetchImageCandidate(tradeport, "tradeport-media").catch(() => null);
  if (tradeportResult) {
    return tradeportResult;
  }

  const settled = await Promise.allSettled(gateways.map((candidate) => fetchImageCandidate(candidate, "ipfs-gateway")));
  for (const result of settled) {
    if (result.status === "fulfilled") {
      return result.value;
    }
  }

  throw new Error("source image unavailable");
}

async function fetchImageCandidate(candidate: string, sourceOrigin: Exclude<LofiGeneratedPetPackSourceOrigin, "local-cache" | "metadata-fallback">): Promise<ResolvedSourceImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4200);
  try {
    const response = await fetch(candidate, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${safeHost(candidate)}:${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await sharp(buffer).metadata();
    return { buffer, sourceOrigin };
  } finally {
    clearTimeout(timeout);
  }
}

function imageCandidates(imageUrl: string) {
  const candidates = new Set<string>([imageUrl]);
  const ipfsMatch = imageUrl.match(/(?:ipfs:\/\/|\/ipfs\/)([^/?#]+)/);
  if (ipfsMatch?.[1]) {
    const cid = ipfsMatch[1];
    candidates.add(`https://w3s.link/ipfs/${cid}`);
    candidates.add(`https://cloudflare-ipfs.com/ipfs/${cid}`);
    candidates.add(`https://gateway.pinata.cloud/ipfs/${cid}`);
    candidates.add(`https://dweb.link/ipfs/${cid}`);
    candidates.add(`https://nftstorage.link/ipfs/${cid}`);
    candidates.add(`https://trustless-gateway.link/ipfs/${cid}`);
    candidates.add(`https://gateway.lighthouse.storage/ipfs/${cid}`);
  }
  return [...candidates];
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function petPublicDir() {
  return process.env.PETLOFI_PETS_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "public", "pets");
}

function packDir(packId: string) {
  return path.join(petPublicDir(), packId);
}

async function createFallbackSourceImage(pack: LofiGeneratedPetPack) {
  const seed = stableHash(`${pack.tokenId}:${pack.name}:${pack.rank ?? "rankless"}`);
  const bodyTint = pick(["#fff7e6", "#f8fbff", "#eff8ef", "#fff1f3", "#f6f0ff"], seed, 0);
  const furShade = pick(["#dfe9f0", "#d9e6dc", "#ebe1ce", "#eadfe7", "#dce8ff"], seed, 1);
  const face = pick(["#5aa6dc", "#6fc6c3", "#6f91d6", "#7bb6ee", "#4f9dc4"], seed, 2);
  const accent = pick(["#ffe06a", "#8cf6d4", "#ff9bb3", "#9ac5ff", "#c9a2ff"], seed, 3);
  const shadow = pick(["#0b3348", "#153238", "#2b2947", "#22334d"], seed, 4);
  const accessory = seed % 4;
  const cheekShift = seed % 18;
  const stripeA = 118 + (seed % 38);
  const stripeB = 140 + ((seed >> 4) % 36);

  const accessorySvg = [
    `<path d="M300 172c36-62 98-62 134 0" fill="none" stroke="${accent}" stroke-width="28" stroke-linecap="round"/>
     <circle cx="292" cy="174" r="19" fill="${accent}"/><circle cx="442" cy="174" r="19" fill="${accent}"/>`,
    `<path d="M244 190h240l-34-52H278z" fill="${accent}" stroke="${shadow}" stroke-width="12" stroke-linejoin="round"/>
     <rect x="312" y="122" width="106" height="44" rx="16" fill="#ffffff" fill-opacity=".48"/>`,
    `<path d="M238 224c46-82 210-82 256 0" fill="none" stroke="${accent}" stroke-width="18" stroke-dasharray="24 18" stroke-linecap="round"/>
     <circle cx="366" cy="178" r="24" fill="${accent}" fill-opacity=".78"/>`,
    `<path d="M252 190c30-42 72-58 126-50 52 8 88 30 108 68-72-12-150-10-234-18z" fill="${accent}" stroke="${shadow}" stroke-width="12" stroke-linejoin="round"/>
     <path d="M300 160c28 14 70 18 126 8" fill="none" stroke="#fff7d6" stroke-width="10" stroke-linecap="round"/>`
  ][accessory];

  const svg = `
    <svg width="768" height="768" viewBox="0 0 768 768" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#07131c" flood-opacity=".3"/>
        </filter>
      </defs>
      <g filter="url(#softShadow)">
        <ellipse cx="384" cy="660" rx="164" ry="38" fill="#072230" fill-opacity=".32"/>
        <path d="M228 414c-42 108 22 226 152 234 132 8 222-80 188-206-18-70-72-122-144-144-78-24-164 18-196 116z" fill="${bodyTint}" stroke="${shadow}" stroke-width="16" stroke-linejoin="round"/>
        <path d="M224 412c-36-28-82-12-98 30-18 48 8 94 62 106 16-44 28-88 36-136z" fill="${bodyTint}" stroke="${shadow}" stroke-width="14"/>
        <path d="M552 416c38-26 84-6 96 38 14 50-18 92-72 98-8-48-16-90-24-136z" fill="${bodyTint}" stroke="${shadow}" stroke-width="14"/>
        <path d="M270 628c-30 32-20 78 30 86 40 6 76-22 78-66" fill="${face}" stroke="${shadow}" stroke-width="13" stroke-linecap="round"/>
        <path d="M472 628c30 32 20 78-30 86-40 6-76-22-78-66" fill="${face}" stroke="${shadow}" stroke-width="13" stroke-linecap="round"/>
        <path d="M220 370c22-122 116-202 236-174 96 22 142 100 128 194-12 88-86 148-184 148-110 0-196-64-180-168z" fill="${bodyTint}" stroke="${shadow}" stroke-width="16" stroke-linejoin="round"/>
        <path d="M254 382c18-80 78-130 154-118 70 12 114 64 106 132-8 70-62 112-136 112-84 0-140-48-124-126z" fill="${face}" stroke="${shadow}" stroke-width="13"/>
        <circle cx="338" cy="390" r="22" fill="#f8ffff" stroke="${shadow}" stroke-width="9"/>
        <circle cx="438" cy="390" r="22" fill="#f8ffff" stroke="${shadow}" stroke-width="9"/>
        <circle cx="${344 + cheekShift / 6}" cy="392" r="8" fill="${shadow}"/>
        <circle cx="${432 - cheekShift / 8}" cy="392" r="8" fill="${shadow}"/>
        <path d="M360 446c18 18 48 18 66 0" fill="none" stroke="${shadow}" stroke-width="12" stroke-linecap="round"/>
        <path d="M248 326c-34-20-34-58 0-82 34 8 54 30 60 66" fill="${furShade}" stroke="${shadow}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M518 326c34-20 34-58 0-82-34 8-54 30-60 66" fill="${furShade}" stroke="${shadow}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M260 522c48 34 114 48 190 42" fill="none" stroke="${furShade}" stroke-width="16" stroke-linecap="round"/>
        <path d="M310 566c44 18 92 24 144 12" fill="none" stroke="${furShade}" stroke-width="12" stroke-linecap="round"/>
        <path d="M240 ${stripeA}c32 28 82 36 150 24" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity=".72"/>
        <path d="M396 ${stripeB}c44 0 82 14 114 42" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity=".68"/>
        ${accessorySvg}
      </g>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function pick<T>(items: T[], seed: number, salt: number) {
  return items[(seed + salt * 2654435761) % items.length];
}

async function readPetJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
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

async function createNftAtlas(source: Buffer, outputPath: string) {
  const composites: sharp.OverlayOptions[] = [];

  for (let row = 0; row < PET_STATES.length; row += 1) {
    const state = PET_STATES[row];
    for (let frame = 0; frame < PET_CELL.columns; frame += 1) {
      const cell = await createNftFrame(source, state, frame);
      composites.push({
        input: cell,
        left: frame * PET_CELL.width,
        top: row * PET_CELL.height
      });
    }
  }

  await sharp({
    create: {
      width: PET_CELL.atlasWidth,
      height: PET_CELL.atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .webp({ quality: 90 })
    .toFile(outputPath);
}

async function createNftFrame(source: Buffer, state: (typeof PET_STATES)[number], frame: number) {
  const phase = (Math.PI * 2 * frame) / PET_CELL.columns;
  const runningOffset = frame % 2 === 0 ? -9 : 9;
  const jumpOffset = Math.round(-20 * Math.sin(Math.PI * frame / (PET_CELL.columns - 1)));
  const stateOffset = {
    idle: { x: 0, y: Math.round(Math.sin(phase) * 3), rotate: 0, size: 148 },
    "running-right": { x: runningOffset, y: frame % 2 === 0 ? -3 : 3, rotate: frame % 2 === 0 ? -3 : 3, size: 146 },
    "running-left": { x: -runningOffset, y: frame % 2 === 0 ? -3 : 3, rotate: frame % 2 === 0 ? 3 : -3, size: 146 },
    waving: { x: Math.round(Math.sin(phase) * 4), y: -3, rotate: frame % 2 === 0 ? -5 : 5, size: 150 },
    jumping: { x: 0, y: jumpOffset - 6, rotate: Math.round(Math.sin(phase) * 3), size: 150 },
    failed: { x: 0, y: 12, rotate: frame % 2 === 0 ? -7 : -3, size: 142 },
    waiting: { x: Math.round(Math.sin(phase) * 3), y: 2, rotate: 0, size: frame % 2 === 0 ? 142 : 146 },
    running: { x: Math.round(Math.sin(phase) * 5), y: Math.round(Math.cos(phase) * 3), rotate: 0, size: frame % 2 === 0 ? 148 : 153 },
    review: { x: frame % 2 === 0 ? -3 : 3, y: -1, rotate: frame % 2 === 0 ? -2 : 2, size: 146 }
  }[state];

  let nft = sharp(source)
    .rotate()
    .ensureAlpha()
    .resize(stateOffset.size, stateOffset.size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    });

  if (state === "running-left") {
    nft = nft.flop();
  }
  if (state === "failed") {
    nft = nft.modulate({ saturation: 0.55, brightness: 0.92 });
  }
  if (state === "review") {
    nft = nft.sharpen();
  }

  const nftBuffer = await nft
    .rotate(stateOffset.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const metadata = await sharp(nftBuffer).metadata();
  const left = Math.round((PET_CELL.width - (metadata.width ?? stateOffset.size)) / 2 + stateOffset.x);
  const top = Math.round(26 + stateOffset.y);

  return sharp({
    create: {
      width: PET_CELL.width,
      height: PET_CELL.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: Buffer.from(frameSvg(state, frame)), left: 16, top: 20 },
      { input: nftBuffer, left, top }
    ])
    .png()
    .toBuffer();
}

function frameSvg(state: (typeof PET_STATES)[number], frame: number) {
  const accent = state === "failed" ? "#ff6b8d" : state === "review" ? "#6fa6ff" : "#4edbd2";
  const bg = CELL_BACKGROUND[state];
  const pulse = state === "running" || state === "review" ? 0.3 + (frame % 2) * 0.12 : 0.16;
  return `
    <svg width="160" height="168" viewBox="0 0 160 168" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="144" height="148" rx="24" fill="${bg}" fill-opacity="0.92" stroke="#062b33" stroke-width="5"/>
      <rect x="18" y="18" width="124" height="128" rx="18" fill="#ffffff" fill-opacity="${pulse}"/>
      <circle cx="130" cy="28" r="9" fill="${accent}" fill-opacity="0.78"/>
    </svg>
  `;
}

async function createContactSheet(spritePath: string, outputPath: string) {
  await sharp(spritePath).resize(Math.round(PET_CELL.atlasWidth / 2), Math.round(PET_CELL.atlasHeight / 2)).webp({ quality: 86 }).toFile(outputPath);
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
