import { getPublicConfig } from "@/lib/config";

function networkSlug(): string {
  return getPublicConfig().suiNetwork || "testnet";
}

export function explorerTxUrl(digest: string): string {
  return `https://suiscan.xyz/${networkSlug()}/tx/${digest}`;
}

export function explorerObjectUrl(id: string): string {
  return `https://suiscan.xyz/${networkSlug()}/object/${id}`;
}

export function faucetUrl(): string {
  return "https://faucet.sui.io/?network=testnet";
}
