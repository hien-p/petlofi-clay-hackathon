import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LofiGeneratedResponse } from "@/lib/lofiGenerated";
import type { TradeportLofiItem, TradeportLofiTopResponse } from "@/lib/lofiMarket";
import { validateSpriteAtlas } from "@/lib/petPack";
import { GET as getPackageZip } from "../../pets/[id]/package.zip/route";
import { GET, POST } from "./route";

const baseDate = "2026-05-26T00:00:00.000Z";

describe("generated Lofi atlas API", () => {
  let petsDir: string;
  let previousPetsDir: string | undefined;

  beforeEach(async () => {
    previousPetsDir = process.env.PETLOFI_PETS_DIR;
    petsDir = await fs.mkdtemp(path.join(os.tmpdir(), "petlofi-pets-"));
    process.env.PETLOFI_PETS_DIR = petsDir;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (previousPetsDir === undefined) {
      delete process.env.PETLOFI_PETS_DIR;
    } else {
      process.env.PETLOFI_PETS_DIR = previousPetsDir;
    }
    await fs.rm(petsDir, { recursive: true, force: true });
  });

  it("keeps GET read-only and returns queued top-10 status", async () => {
    const top = makeTopResponse();
    stubFetch(top, await makePng(), { imageMode: "success" });

    const response = await GET(new Request("http://localhost/api/lofi/generated"));
    const body = (await response.json()) as LofiGeneratedResponse;

    expect(response.status).toBe(200);
    expect(body.packs).toHaveLength(10);
    expect(body.readyCount).toBe(0);
    expect(body.previewCount).toBe(0);
    expect(body.queuedCount).toBe(10);
    await expect(fs.readdir(petsDir)).resolves.toHaveLength(0);
  });

  it("generates a selected real-image atlas, then prefers the cached source image", async () => {
    const top = makeTopResponse();
    stubFetch(top, await makePng("#8cf6d4"), { imageMode: "success" });

    const firstResponse = await POST(
      new Request("http://localhost/api/lofi/generated", {
        method: "POST",
        body: JSON.stringify({ mode: "selected", selectedTokenId: "0xlofi1" })
      })
    );
    const firstBody = (await firstResponse.json()) as LofiGeneratedResponse;
    const firstPack = firstBody.packs.find((pack) => pack.tokenId === "0xlofi1");

    expect(firstPack).toMatchObject({
      status: "ready",
      sourceOrigin: "tradeport-media",
      generationMode: "deterministic"
    });
    expect(firstBody.readyCount).toBe(1);
    expect(firstBody.previewCount).toBe(0);
    expect(firstPack?.sourceImageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstPack?.packHash).toMatch(/^[a-f0-9]{64}$/);

    const packDir = path.join(petsDir, firstPack?.packId ?? "");
    validateSpriteAtlas(await fs.readFile(path.join(packDir, "spritesheet.webp")));
    await expect(fs.readFile(path.join(packDir, "source-image.png"))).resolves.toBeInstanceOf(Buffer);

    const zipResponse = await getPackageZip(new Request("http://localhost/api/pets/package.zip"), {
      params: Promise.resolve({ id: firstPack?.packId ?? "" })
    });
    const zip = await JSZip.loadAsync(Buffer.from(await zipResponse.arrayBuffer()));
    expect(zip.file("pet.json")).toBeTruthy();
    expect(zip.file("spritesheet.webp")).toBeTruthy();
    expect(zip.file("contact-sheet.webp")).toBeTruthy();

    stubFetch(top, await makePng("#000000"), { imageMode: "fail" });
    const cachedResponse = await POST(
      new Request("http://localhost/api/lofi/generated", {
        method: "POST",
        body: JSON.stringify({ mode: "selected", selectedTokenId: "0xlofi1" })
      })
    );
    const cachedBody = (await cachedResponse.json()) as LofiGeneratedResponse;
    const cachedPack = cachedBody.packs.find((pack) => pack.tokenId === "0xlofi1");
    expect(cachedPack).toMatchObject({ status: "ready", sourceOrigin: "local-cache" });
  });

  it("keeps unreachable NFT art as a preview fallback instead of real ready", async () => {
    const top = makeTopResponse({ imageUrl: "ipfs://missing-art" });
    stubFetch(top, await makePng(), { imageMode: "fail" });

    const response = await POST(
      new Request("http://localhost/api/lofi/generated", {
        method: "POST",
        body: JSON.stringify({ mode: "selected", selectedTokenId: "0xlofi1" })
      })
    );
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
    await expect(fs.readFile(path.join(petsDir, pack?.packId ?? "", "source-fallback.png"))).resolves.toBeInstanceOf(Buffer);
  });
});

function stubFetch(
  top: TradeportLofiTopResponse,
  image: Buffer,
  options: { imageMode: "success" | "fail" }
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
      if (url.includes("/api/lofi/top")) {
        return Response.json(top);
      }
      if (options.imageMode === "success" && url.startsWith("https://example.com/")) {
        return new Response(new Uint8Array(image), { headers: { "content-type": "image/png" } });
      }
      return new Response("not found", { status: 404 });
    })
  );
}

async function makePng(color = "#93f5c8") {
  return sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: color
    }
  })
    .png()
    .toBuffer();
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
