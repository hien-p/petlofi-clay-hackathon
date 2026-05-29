import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lofiGeneratedPackId, type LofiGeneratedResponse } from "@/lib/lofiGenerated";
import type { TradeportLofiItem, TradeportLofiTopResponse } from "@/lib/lofiMarket";
import { PET_STATES } from "@/lib/petPack";
import { GET, POST } from "./route";

const baseDate = "2026-05-26T00:00:00.000Z";

describe("generated Lofi atlas API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps GET read-only and returns queued top-10 status", async () => {
    const top = makeTopResponse();
    stubFetch(top);

    const response = await GET(new Request("http://localhost/api/lofi/generated"));
    const body = (await response.json()) as LofiGeneratedResponse;

    expect(response.status).toBe(200);
    expect(body.packs).toHaveLength(10);
    expect(body.readyCount).toBe(0);
    expect(body.previewCount).toBe(0);
    expect(body.queuedCount).toBe(10);
  });

  it("surfaces pre-generated public packs as real atlas status", async () => {
    const top = makeTopResponse();
    const packId = lofiGeneratedPackId(top.mostExpensive[0]);
    stubFetch(top, {
      [packId]: {
        petJson: makeStoredPetJson(packId, "local-cache"),
        spritesheet: await makeAtlasWebp()
      }
    });

    const response = await GET(new Request("http://localhost/api/lofi/generated?selected=0xlofi1"));
    const body = (await response.json()) as LofiGeneratedResponse;
    const pack = body.packs.find((candidate) => candidate.tokenId === "0xlofi1");

    expect(body.readyCount).toBe(1);
    expect(body.previewCount).toBe(0);
    expect(pack).toMatchObject({
      status: "ready",
      sourceOrigin: "local-cache",
      sourceMode: "nft-image",
      generationMode: "deterministic"
    });
    expect(pack?.packHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack?.sourceImageHash).toBe("a".repeat(64));
  });

  it("keeps pre-generated metadata fallbacks separate from real ready packs", async () => {
    const top = makeTopResponse({ imageUrl: "ipfs://missing-art" });
    const packId = lofiGeneratedPackId(top.mostExpensive[0]);
    stubFetch(top, {
      [packId]: {
        petJson: makeStoredPetJson(packId, "metadata-fallback"),
        spritesheet: await makeAtlasWebp()
      }
    });

    const response = await GET(new Request("http://localhost/api/lofi/generated?selected=0xlofi1"));
    const body = (await response.json()) as LofiGeneratedResponse;
    const pack = body.packs.find((candidate) => candidate.tokenId === "0xlofi1");

    expect(body.readyCount).toBe(0);
    expect(body.previewCount).toBe(1);
    expect(pack).toMatchObject({
      status: "preview",
      sourceOrigin: "metadata-fallback",
      sourceMode: "metadata-fallback"
    });
    expect(pack?.warning).toContain("fallback preview");
  });

  it("returns an explicit disabled response for runtime generation", async () => {
    const response = await POST();
    const body = (await response.json()) as LofiGeneratedResponse;

    expect(response.status).toBe(501);
    expect(body.readyCount).toBe(0);
    expect(body.previewCount).toBe(0);
    expect(body.queuedCount).toBe(0);
    expect(body.warning).toContain("On-demand pack generation is disabled");
  });
});

function stubFetch(top: TradeportLofiTopResponse, packs: Record<string, { petJson: Record<string, unknown>; spritesheet: Buffer }> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
      if (url.includes("/api/lofi/top")) {
        return Response.json(top);
      }
      const petJsonMatch = /\/pets\/([^/]+)\/pet\.json/.exec(url);
      if (petJsonMatch) {
        const pack = packs[petJsonMatch[1]];
        return pack ? Response.json(pack.petJson) : new Response("not found", { status: 404 });
      }
      const spritesheetMatch = /\/pets\/([^/]+)\/spritesheet\.webp/.exec(url);
      if (spritesheetMatch) {
        const pack = packs[spritesheetMatch[1]];
        return pack
          ? new Response(new Uint8Array(pack.spritesheet), { headers: { "content-type": "image/webp" } })
          : new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    })
  );
}

async function makeAtlasWebp() {
  return sharp({
    create: {
      width: 1536,
      height: 1872,
      channels: 4,
      background: "#00000000"
    }
  })
    .webp()
    .toBuffer();
}

function makeStoredPetJson(packId: string, sourceOrigin: "local-cache" | "metadata-fallback") {
  return {
    id: packId,
    displayName: "Lofi NFTs #1",
    description:
      sourceOrigin === "metadata-fallback"
        ? "Fallback preview atlas staged from metadata because source NFT art was unavailable."
        : "Real image-backed deterministic 8x9 atlas for PetLofi.",
    spritesheetPath: "spritesheet.webp",
    sourceOrigin,
    sourceMode: sourceOrigin === "metadata-fallback" ? "metadata-fallback" : "nft-image",
    sourceImageHash: "a".repeat(64),
    generationMode: "deterministic",
    lastGeneratedAt: baseDate,
    states: PET_STATES
  };
}

function makeTopResponse(overrides: Partial<TradeportLofiItem> = {}): TradeportLofiTopResponse {
  const items = Array.from({ length: 12 }, (_, index) => makeItem(index + 1, overrides));
  return {
    collection: {
      id: "collection",
      slug: "lofi",
      type: "0xcollection::lofi::NFT",
      tradeportUrl: "https://www.tradeport.xyz/sui/collection/lofi",
      floorSui: "10",
      supply: 358
    },
    fetchedAt: baseDate,
    animationMintFeeSui: "0.5",
    mostExpensive: items.slice(0, 7),
    rarest: [items[0], ...items.slice(7, 12)]
  };
}

function makeItem(number: number, overrides: Partial<TradeportLofiItem>): TradeportLofiItem {
  const base: TradeportLofiItem = {
    id: `id-${number}`,
    tokenId: `0xlofi${number}`,
    name: `Lofi NFTs #${number}`,
    imageUrl: `https://example.com/lofi-${number}.png`,
    mediaType: "image/png",
    ranking: number,
    rarity: null,
    owner: `0xowner${number}`,
    listed: number < 8,
    priceMist: null,
    priceSui: String(100 - number),
    marketName: "TradePort",
    listingId: `listing-${number}`,
    listedAt: null,
    sourceUrl: `https://tradeport.xyz/${number}`
  };
  return { ...base, ...overrides };
}
