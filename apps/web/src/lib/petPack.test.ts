import { describe, expect, it } from "vitest";
import {
  ARENA_RUN_SECONDS,
  applyArenaCuddle,
  applyArenaHit,
  applyArenaSnackPickup,
  arenaOutcomeAction,
  completeArenaRun,
  createArenaRunSnapshot,
  tickArenaRun
} from "./arena";
import { ANIMATION_MEANINGS, canEvolvePet, evolvePet, feedPet, restPet } from "./gameActions";
import { buildTop10GeneratedPacks, countGeneratedPacks } from "./lofiGenerated";
import { buildUniqueLofiAnimationVariants, type TradeportLofiItem } from "./lofiMarket";
import { PET_CELL, PET_STATE_TO_ROW, parsePetJson } from "./petPack";
import { buildNameQuests, formatSuiBalance, identityDisplayName, normalizeSuiName, shortAddress } from "./suins";

describe("pet pack contract", () => {
  it("keeps the Codex 8x9 atlas dimensions explicit", () => {
    expect(PET_CELL.atlasWidth).toBe(1536);
    expect(PET_CELL.atlasHeight).toBe(1872);
    expect(PET_STATE_TO_ROW.review).toBe(8);
  });

  it("validates pet.json shape", () => {
    const pet = parsePetJson(
      JSON.stringify({
        id: "lofi-yeti",
        displayName: "CLAY Lofi Yeti",
        description: "A tiny lofi work companion.",
        spritesheetPath: "spritesheet.webp",
        referenceUrl: "https://hackathon.lofitheyeti.com/",
        states: ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]
      })
    );
    expect(pet.displayName).toBe("CLAY Lofi Yeti");
    expect(pet.states?.[8]).toBe("review");
  });

  it("defines a use case for every visible animation state", () => {
    expect(ANIMATION_MEANINGS.map((item) => item.state)).toEqual([
      "idle",
      "waiting",
      "running",
      "review",
      "jumping",
      "waving",
      "failed",
      "running-right",
      "running-left"
    ]);
  });

  it("mirrors local game action deltas from the Move contract", () => {
    const base = { level: 2, xp: 120, mood: 92, energy: 80, streak: 1, evolutionStage: 0 };
    expect(feedPet(base)).toMatchObject({ mood: 100, energy: 84 });
    expect(restPet(base)).toMatchObject({ mood: 94, energy: 100 });
    expect(canEvolvePet(base)).toBe(false);
    expect(evolvePet({ ...base, level: 3 })).toMatchObject({ evolutionStage: 1, mood: 100 });
  });

  it("normalizes SuiNS identity labels while keeping address fallback playable", () => {
    expect(normalizeSuiName("harry.sui")).toBe("@harry");
    expect(normalizeSuiName("@lofi")).toBe("@lofi");
    expect(shortAddress("0x1234567890abcdef")).toBe("0x1234...cdef");
    expect(identityDisplayName("0x1234567890abcdef", null)).toBe("0x1234...cdef");
    expect(identityDisplayName("local-demo-owner", null)).toBe("@clay-builder");
    expect(formatSuiBalance("1234567890")).toBe("1.234 SUI");
  });

  it("tracks SuiNS companion quests as an identity passport", () => {
    const quests = buildNameQuests({
      hasWallet: true,
      hasSuiName: true,
      isEquipped: true,
      isMinted: true,
      hasAgentRun: true,
      hasMemory: false,
      hasWalrusProof: true,
      hasEvolution: false
    });

    expect(quests.find((quest) => quest.id === "resolve-name")?.complete).toBe(true);
    expect(quests.find((quest) => quest.id === "save-memory")?.complete).toBe(false);
    expect(quests.find((quest) => quest.id === "publish-proof")?.complete).toBe(true);
  });

  it("scores a 60 second arena survival run", () => {
    const start = Date.UTC(2026, 4, 21, 10, 0, 0);
    const running = createArenaRunSnapshot(start);
    expect(running.phase).toBe("running");
    expect(running.timeLeftMs).toBe(ARENA_RUN_SECONDS * 1000);

    const withSnack = applyArenaSnackPickup(running);
    expect(withSnack).toMatchObject({ score: 40, snacksCollected: 1, safety: 100 });

    const withCuddle = applyArenaCuddle(withSnack, 3);
    expect(withCuddle).toMatchObject({ score: 125, enemiesCleared: 3, cuddleReady: false });

    const withHit = applyArenaHit(withCuddle);
    expect(withHit).toMatchObject({ safety: 88, hitsTaken: 1 });

    const victory = tickArenaRun(withHit, start + ARENA_RUN_SECONDS * 1000);
    const summary = completeArenaRun(victory, start + ARENA_RUN_SECONDS * 1000, true, ["running", "jumping"]);
    expect(summary).toMatchObject({ outcome: "victory", score: 125, durationMs: 60000, specialUsed: true });
    expect(arenaOutcomeAction(summary.outcome)).toBe("completed");
  });

  it("fails arena runs when safety reaches zero", () => {
    const start = Date.UTC(2026, 4, 21, 10, 0, 0);
    let snapshot = createArenaRunSnapshot(start);
    for (let i = 0; i < 9; i += 1) {
      snapshot = applyArenaHit(snapshot);
    }

    const summary = completeArenaRun(snapshot, start + 14_000, false, ["running", "failed"]);
    expect(snapshot.phase).toBe("failed");
    expect(summary.outcome).toBe("failed");
    expect(arenaOutcomeAction(summary.outcome)).toBe("failed");
  });

  it("builds deterministic animated variants for crawled Lofi NFTs", () => {
    const items: TradeportLofiItem[] = [
      {
        id: "a",
        tokenId: "0xlofi1",
        name: "Lofi NFTs #1",
        imageUrl: "ipfs://one",
        mediaType: null,
        ranking: 1,
        rarity: null,
        owner: "0xowner",
        listed: true,
        priceMist: null,
        priceSui: "100",
        marketName: "TradePort",
        listingId: "listing-a",
        listedAt: null,
        sourceUrl: "https://tradeport.xyz/a"
      },
      {
        id: "duplicate",
        tokenId: "0xlofi1",
        name: "Lofi NFTs #1",
        imageUrl: "ipfs://one",
        mediaType: null,
        ranking: 1,
        rarity: null,
        owner: "0xowner",
        listed: true,
        priceMist: null,
        priceSui: "100",
        marketName: "TradePort",
        listingId: "listing-a",
        listedAt: null,
        sourceUrl: "https://tradeport.xyz/a"
      }
    ];

    const variants = buildUniqueLofiAnimationVariants(items, "0.5");
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      tokenId: "0xlofi1",
      name: "Lofi NFTs #1",
      ranking: 1,
      animationPassFeeSui: "0.5"
    });
    expect(variants[0].hue).toBeGreaterThanOrEqual(0);
    expect(variants[0].tintHex).toBeGreaterThan(0);
  });

  it("selects Batch A generated Lofi targets without marking queued packs as real", () => {
    const items = Array.from({ length: 12 }, (_, index): TradeportLofiItem => {
      const number = index + 1;
      return {
        id: `id-${number}`,
        tokenId: `0xlofi${number}`,
        name: `Lofi NFTs #${number}`,
        imageUrl: `https://example.com/${number}.png`,
        mediaType: null,
        ranking: number,
        rarity: null,
        owner: "0xowner",
        listed: true,
        priceMist: null,
        priceSui: String(100 - index),
        marketName: "TradePort",
        listingId: `listing-${number}`,
        listedAt: null,
        sourceUrl: `https://tradeport.xyz/${number}`
      };
    });

    const packs = buildTop10GeneratedPacks(
      {
        collection: {
          id: "collection",
          slug: "slug",
          type: "type",
          tradeportUrl: "https://tradeport.xyz",
          floorSui: "10",
          supply: 358
        },
        fetchedAt: "2026-05-25T00:00:00.000Z",
        animationMintFeeSui: "0.5",
        mostExpensive: [items[0], items[1], items[2], items[3], items[4], items[5], items[6]],
        rarest: [items[0], items[7], items[8], items[9], items[10], items[11]]
      },
      "0xlofi8",
      "2026-05-25T00:00:00.000Z"
    );

    expect(packs).toHaveLength(10);
    expect(new Set(packs.map((pack) => pack.tokenId)).size).toBe(10);
    expect(packs.filter((pack) => pack.batch === "A").map((pack) => pack.tokenId)).toEqual([
      "0xlofi1",
      "0xlofi8",
      "0xlofi2"
    ]);
    expect(countGeneratedPacks(packs)).toEqual({ readyCount: 0, previewCount: 0, queuedCount: 10 });
    expect(packs[0].spritesheetUrl).toMatch(/^\/pets\/lofi-nfts-1-/);
  });
});
