import { promises as fs } from "node:fs";
import path from "node:path";
import { sha256Hex, stableJson } from "@petlofi/agent";
import { walrusDir } from "./serverPaths";

export type WalrusUploadInput = {
  kind: "pet-pack" | "agent-proof" | "memory-proof" | "arena-proof";
  network?: string;
  payload: unknown;
};

export type WalrusUploadResult = {
  blobId: string;
  network: string;
  proofUrl: string;
  digest: string;
  storage: "walrus" | "local";
};

export async function uploadWalrusProof(input: WalrusUploadInput): Promise<WalrusUploadResult> {
  const network = input.network ?? process.env.WALRUS_NETWORK ?? "testnet";
  const encoded = new TextEncoder().encode(stableJson(input.payload));
  const digest = sha256Hex(encoded);
  const publisher = process.env.WALRUS_PUBLISHER_URL;

  if (publisher) {
    try {
      const endpoint = `${publisher.replace(/\/$/, "")}/v1/blobs?epochs=5`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: encoded
      });

      if (response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        const blobId =
          readPath(body, ["newlyCreated", "blobObject", "blobId"]) ??
          readPath(body, ["alreadyCertified", "blobId"]) ??
          readPath(body, ["blobId"]);
        if (typeof blobId === "string" && blobId.length > 0) {
          return {
            blobId,
            network,
            digest,
            storage: "walrus",
            proofUrl: `${process.env.WALRUS_AGGREGATOR_URL?.replace(/\/$/, "") ?? ""}/v1/blobs/${blobId}`
          };
        }
      }
    } catch {
      // Local proof mode below keeps the demo usable when Walrus credentials or network are unavailable.
    }
  }

  const blobId = `local_${digest.slice(0, 32)}`;
  await fs.mkdir(walrusDir(), { recursive: true });
  await fs.writeFile(
    path.join(walrusDir(), `${blobId}.json`),
    JSON.stringify({ ...input, network, digest, createdAt: new Date().toISOString() }, null, 2)
  );

  return {
    blobId,
    network,
    digest,
    storage: "local",
    proofUrl: `file://${path.join(walrusDir(), `${blobId}.json`)}`
  };
}

function readPath(value: Record<string, unknown>, pathParts: string[]): unknown {
  return pathParts.reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, value);
}
