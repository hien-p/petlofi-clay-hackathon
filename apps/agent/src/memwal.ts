import { promises as fs } from "node:fs";
import path from "node:path";
import { createProofId, sha256Hex } from "./proof.js";
import type { MemoryRecall, MemoryRecord } from "./types.js";

type MemWalConfig = {
  url?: string;
  bearerToken?: string;
  accountId?: string;
  dataDir?: string;
};

type RememberInput = {
  namespace?: string;
  owner: string;
  petId: string;
  content: string;
  tags?: string[];
};

type RecallInput = {
  namespace?: string;
  owner: string;
  petId: string;
  query: string;
};

const DEFAULT_NAMESPACE = "petlofi";

export class PetLofiMemoryClient {
  private readonly config: MemWalConfig;

  constructor(config: MemWalConfig = {}) {
    this.config = config;
  }

  async remember(input: RememberInput): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: createProofId("mem"),
      namespace: input.namespace ?? DEFAULT_NAMESPACE,
      owner: input.owner,
      petId: input.petId,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString()
    };

    if (this.canUseMemWal()) {
      try {
        await this.callMcpTool("memwal_remember", {
          namespace: record.namespace,
          text: record.content,
          metadata: {
            id: record.id,
            owner: record.owner,
            petId: record.petId,
            tags: record.tags
          }
        });
        return record;
      } catch {
        await this.writeLocal(record);
        return record;
      }
    }

    await this.writeLocal(record);
    return record;
  }

  async recall(input: RecallInput): Promise<MemoryRecall> {
    if (this.canUseMemWal()) {
      try {
        const result = await this.callMcpTool("memwal_recall", {
          namespace: input.namespace ?? DEFAULT_NAMESPACE,
          query: input.query,
          limit: 5
        });
        const summary = typeof result === "string" ? result : JSON.stringify(result).slice(0, 800);
        return { source: "memwal", records: [], summary };
      } catch {
        return this.recallLocal(input);
      }
    }

    return this.recallLocal(input);
  }

  private canUseMemWal(): boolean {
    return Boolean(this.config.url && this.config.bearerToken && this.config.accountId);
  }

  private async callMcpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const url = this.config.url;
    if (!url) {
      throw new Error("MemWal URL is not configured");
    }

    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.config.bearerToken}`,
      "x-memwal-account-id": this.config.accountId ?? ""
    };

    const initialize = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: sha256Hex(`${name}:initialize`).slice(0, 10),
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "petlofi", version: "0.1.0" }
        }
      })
    });

    const sessionId = initialize.headers.get("mcp-session-id") ?? undefined;
    await readJsonish(initialize).catch(() => undefined);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        ...(sessionId ? { "mcp-session-id": sessionId } : {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: sha256Hex(`${name}:${JSON.stringify(args)}`).slice(0, 10),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });

    if (!response.ok) {
      throw new Error(`MemWal MCP ${name} failed: ${response.status} ${await response.text()}`);
    }

    return readJsonish(response);
  }

  private async recallLocal(input: RecallInput): Promise<MemoryRecall> {
    const records = await this.readLocal();
    const namespace = input.namespace ?? DEFAULT_NAMESPACE;
    const needle = input.query.toLowerCase();
    const matches = records
      .filter((record) => record.namespace === namespace && record.owner === input.owner && record.petId === input.petId)
      .filter((record) => record.content.toLowerCase().includes(needle) || record.tags.some((tag) => tag.toLowerCase().includes(needle)))
      .slice(-5)
      .reverse();

    return {
      source: "local",
      records: matches,
      summary: matches.length
        ? matches.map((record) => record.content).join("\n")
        : "No prior PetLofi memories found for this pet yet."
    };
  }

  private async writeLocal(record: MemoryRecord): Promise<void> {
    const records = await this.readLocal();
    records.push(record);
    await fs.mkdir(this.localDir(), { recursive: true });
    await fs.writeFile(this.localFile(), JSON.stringify(records, null, 2));
  }

  private async readLocal(): Promise<MemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.localFile(), "utf8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch {
      return [];
    }
  }

  private localDir(): string {
    return this.config.dataDir ?? path.join(process.cwd(), ".petlofi");
  }

  private localFile(): string {
    return path.join(this.localDir(), "memory.json");
  }
}

async function readJsonish(response: Response): Promise<unknown> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const dataLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    return dataLine ? JSON.parse(dataLine.slice(5).trim()) : text;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createMemoryClientFromEnv(env: NodeJS.ProcessEnv = process.env): PetLofiMemoryClient {
  return new PetLofiMemoryClient({
    url: env.MEMWAL_MCP_HTTP_URL,
    bearerToken: env.MEMWAL_BEARER_TOKEN,
    accountId: env.MEMWAL_ACCOUNT_ID,
    dataDir: env.PETLOFI_DATA_DIR
  });
}
