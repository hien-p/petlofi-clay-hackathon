export const LOFI_COLLECTION_ID = "0ef57a91-863b-4f0d-9837-ab8391a188ea";
export const LOFI_COLLECTION_SLUG =
  "0x559c9c8867b5f9d82676ea1ee3d0c6d13338a77df6cd9194ff91bb6f75cafa69";
export const LOFI_COLLECTION_TYPE =
  "0x559c9c8867b5f9d82676ea1ee3d0c6d13338a77df6cd9194ff91bb6f75cafa69::token::LofiNfts";
export const LOFI_TRADEPORT_URL = `https://www.tradeport.xyz/sui/collection/${LOFI_COLLECTION_SLUG}?bottomTab=trades&tab=items`;
export const DEFAULT_ANIMATION_MINT_FEE_SUI = "0.5";

export type LofiMarketSort = "price" | "rarity";

export type TradeportLofiItem = {
  id: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  mediaType: string | null;
  ranking: number | null;
  rarity: number | null;
  owner: string | null;
  listed: boolean;
  priceMist: string | null;
  priceSui: string | null;
  marketName: string | null;
  listingId: string | null;
  listedAt: string | null;
  sourceUrl: string;
};

export type TradeportLofiTopResponse = {
  collection: {
    id: string;
    slug: string;
    type: string;
    tradeportUrl: string;
    floorSui: string;
    supply: number;
  };
  fetchedAt: string;
  animationMintFeeSui: string;
  mostExpensive: TradeportLofiItem[];
  rarest: TradeportLofiItem[];
  warning?: string;
};

export type LofiAnimationVariant = {
  id: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  tintHex: number;
  accentHex: number;
  hue: number;
  ranking: number | null;
  priceSui: string | null;
  owner: string | null;
  animationPassFeeSui: string;
  sourceUrl: string;
};

export function buildLofiAnimationVariant(item: TradeportLofiItem, index: number, animationPassFeeSui: string): LofiAnimationVariant {
  const seed = hashLofiVariantSeed(`${item.tokenId}:${item.name}:${index}`);
  const hue = seed % 360;
  const tintHex = hslToHexNumber(hue, 78, 58);
  const accentHex = hslToHexNumber((hue + 42) % 360, 90, 64);

  return {
    id: `lofi-animation:${item.tokenId}`,
    tokenId: item.tokenId,
    name: item.name,
    imageUrl: item.imageUrl,
    tintHex,
    accentHex,
    hue,
    ranking: item.ranking,
    priceSui: item.priceSui,
    owner: item.owner,
    animationPassFeeSui,
    sourceUrl: item.sourceUrl
  };
}

export function buildUniqueLofiAnimationVariants(items: TradeportLofiItem[], animationPassFeeSui: string): LofiAnimationVariant[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.tokenId || item.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((item, index) => buildLofiAnimationVariant(item, index, animationPassFeeSui));
}

export function normalizeNftImageUrl(url: string): string {
  if (!url) {
    return "";
  }

  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`;
  }

  if (url.startsWith("ar://")) {
    return `https://arweave.net/${url.slice("ar://".length)}`;
  }

  return url;
}

function hashLofiVariantSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function hslToHexNumber(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return ((Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)) >>> 0;
}

export function mistToSuiString(priceMist: string | number | null | undefined): string | null {
  if (priceMist === null || priceMist === undefined || priceMist === "") {
    return null;
  }

  const mist = typeof priceMist === "number" ? BigInt(Math.trunc(priceMist)) : BigInt(priceMist);
  const whole = mist / 1_000_000_000n;
  const fraction = mist % 1_000_000_000n;
  const trimmedFraction = fraction.toString().padStart(9, "0").replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

export function shortObjectId(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
