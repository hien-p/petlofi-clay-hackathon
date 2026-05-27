export type SuiIdentityStatus = "local" | "loading" | "resolved" | "no-name" | "error";

export type SuiIdentity = {
  status: SuiIdentityStatus;
  address: string;
  displayName: string;
  suinsName: string | null;
  balanceMist: string | null;
  ownedObjectCount: number | null;
  error?: string;
};

export type NameQuest = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
};

export function shortAddress(address: string): string {
  if (!address || address === "local-demo-owner") {
    return "local-demo-owner";
  }

  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeSuiName(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed.replace(/\.sui$/i, "")}`;
}

export function identityDisplayName(address: string, suinsName: string | null | undefined): string {
  if (!suinsName && address === "local-demo-owner") {
    return "@clay-builder";
  }

  return normalizeSuiName(suinsName) ?? shortAddress(address);
}

export function formatSuiBalance(balanceMist: string | null): string {
  if (!balanceMist) {
    return "Unknown";
  }

  const mist = BigInt(balanceMist);
  const whole = mist / 1_000_000_000n;
  const fractional = (mist % 1_000_000_000n).toString().padStart(9, "0").slice(0, 3);
  return `${whole}.${fractional} SUI`;
}

export function buildNameQuests(input: {
  hasWallet: boolean;
  hasSuiName: boolean;
  isEquipped: boolean;
  isMinted: boolean;
  hasAgentRun: boolean;
  hasMemory: boolean;
  hasWalrusProof: boolean;
  hasEvolution: boolean;
}): NameQuest[] {
  return [
    {
      id: "resolve-name",
      label: input.hasSuiName ? "SuiNS resolved" : "Find SuiNS identity",
      detail: input.hasSuiName ? "Human-readable builder name is active." : "No SuiNS yet; address mode still works.",
      complete: input.hasWallet && input.hasSuiName
    },
    {
      id: "equip-pet",
      label: "Equip PetLofi to identity",
      detail: "Attach this pet as the visual companion for the active SuiNS/address identity.",
      complete: input.isEquipped
    },
    {
      id: "mint-pet",
      label: "Mint companion object",
      detail: "Create the owner-gated pet object and Walrus animation proof.",
      complete: input.isMinted
    },
    {
      id: "run-agent",
      label: "Run proof-of-work task",
      detail: "Let the pet react while the AI agent works.",
      complete: input.hasAgentRun
    },
    {
      id: "save-memory",
      label: "Save memory",
      detail: "Store the useful task summary through MemWal and link the blob.",
      complete: input.hasMemory
    },
    {
      id: "publish-proof",
      label: "Publish Walrus proof",
      detail: "Show a durable blob pointer for the identity passport.",
      complete: input.hasWalrusProof
    },
    {
      id: "evolve-name",
      label: "Evolve reputation",
      detail: "Grow the pet as the builder identity gains history.",
      complete: input.hasEvolution
    }
  ];
}
