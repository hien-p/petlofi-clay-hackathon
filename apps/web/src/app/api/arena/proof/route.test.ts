import { describe, expect, it } from "vitest";
import type { ArenaProofReceipt } from "@/lib/arena";
import { POST } from "./route";

describe("arena proof API", () => {
  it("stores arena receipts through local Walrus fallback", async () => {
    const previousPublisher = process.env.WALRUS_PUBLISHER_URL;
    delete process.env.WALRUS_PUBLISHER_URL;

    const receipt: ArenaProofReceipt = {
      kind: "arena-proof",
      identity: "@clay-builder",
      petId: "template:lofi-yeti",
      petName: "CLAY Lofi Yeti",
      createdAt: new Date("2026-05-21T10:00:00.000Z").toISOString(),
      summary: {
        outcome: "victory",
        score: 420,
        safety: 76,
        snacksCollected: 4,
        enemiesCleared: 9,
        hitsTaken: 2,
        durationMs: 60_000,
        startedAt: new Date("2026-05-21T09:59:00.000Z").toISOString(),
        completedAt: new Date("2026-05-21T10:00:00.000Z").toISOString(),
        specialUsed: true,
        animationStates: ["running", "review", "jumping"]
      }
    };

    const response = await POST(
      new Request("http://localhost/api/arena/proof", {
        method: "POST",
        body: JSON.stringify(receipt)
      })
    );
    const body = (await response.json()) as { blobId: string; storage: string; proofUrl: string };

    expect(response.status).toBe(200);
    expect(body.storage).toBe("local");
    expect(body.blobId).toMatch(/^local_/);
    expect(body.proofUrl).toContain(body.blobId);

    if (previousPublisher) {
      process.env.WALRUS_PUBLISHER_URL = previousPublisher;
    }
  });
});
