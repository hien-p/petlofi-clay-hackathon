import { NextResponse } from "next/server";
import {
  DEFAULT_ANIMATION_MINT_FEE_SUI,
  LOFI_COLLECTION_ID,
  LOFI_COLLECTION_SLUG,
  LOFI_COLLECTION_TYPE,
  LOFI_TRADEPORT_URL,
  mistToSuiString,
  normalizeNftImageUrl,
  type TradeportLofiItem,
  type TradeportLofiTopResponse
} from "@/lib/lofiMarket";

export const dynamic = "force-dynamic";

type TradeportGraphqlResponse<T> = {
  data?: {
    sui?: T;
  };
  errors?: Array<{ message?: string }>;
};

type RawNft = {
  id?: string;
  token_id?: string;
  name?: string;
  media_url?: string;
  media_type?: string | null;
  ranking?: number | null;
  rarity?: number | null;
  owner?: string | null;
  listings?: RawListing[];
};

type RawListing = {
  id?: string;
  price?: number | string | null;
  listed?: boolean | null;
  market_name?: string | null;
  block_time?: string | null;
  nft?: RawNft;
};

const TRADEPORT_GRAPHQL_URL = "https://graphql.tradeport.gg";
const TRADEPORT_HEADERS = {
  "content-type": "application/json",
  "x-api-user": process.env.TRADEPORT_API_USER ?? "tradeport.xyz",
  "x-api-key": process.env.TRADEPORT_API_KEY ?? "7cJ09MM.9c8d37fc6e5fad1cf0823c68657cabdd",
  "x-vercel-id": process.env.TRADEPORT_VERCEL_ID ?? "wtf1::tvf3s-9171698922372-lci3z74vv1da"
};

const listedQuery = `
  query PetLofiListed($where: listings_bool_exp!, $order_by: [listings_order_by!], $limit: Int!) {
    sui {
      listings(where: $where, order_by: $order_by, limit: $limit) {
        id
        price
        listed
        market_name
        block_time
        nft {
          id
          token_id
          name
          media_url
          media_type
          ranking
          rarity
          owner
        }
      }
    }
  }
`;

const rareQuery = `
  query PetLofiRarest($where: nfts_bool_exp!, $order_by: [nfts_order_by!], $limit: Int!) {
    sui {
      nfts(where: $where, order_by: $order_by, limit: $limit) {
        id
        token_id
        name
        media_url
        media_type
        ranking
        rarity
        owner
        listings(where: {listed: {_eq: true}}, order_by: {price: asc_nulls_last}, limit: 1) {
          id
          price
          listed
          market_name
          block_time
        }
      }
    }
  }
`;

export async function GET() {
  try {
    const [listed, rare] = await Promise.all([
      tradeportQuery<{ listings: RawListing[] }>(listedQuery, {
        where: { collection_id: { _eq: LOFI_COLLECTION_ID }, listed: { _eq: true } },
        order_by: [{ price: "desc_nulls_last" }],
        limit: 10
      }),
      tradeportQuery<{ nfts: RawNft[] }>(rareQuery, {
        where: { collection_id: { _eq: LOFI_COLLECTION_ID } },
        order_by: { ranking: "asc_nulls_last" },
        limit: 10
      })
    ]);

    const payload: TradeportLofiTopResponse = {
      collection: {
        id: LOFI_COLLECTION_ID,
        slug: LOFI_COLLECTION_SLUG,
        type: LOFI_COLLECTION_TYPE,
        tradeportUrl: LOFI_TRADEPORT_URL,
        floorSui: "10",
        supply: 358
      },
      fetchedAt: new Date().toISOString(),
      animationMintFeeSui: process.env.NEXT_PUBLIC_ANIMATION_MINT_FEE_SUI ?? DEFAULT_ANIMATION_MINT_FEE_SUI,
      mostExpensive: listed.listings.map((listing) => normalizeListingItem(listing)).filter(isTradeportItem),
      rarest: rare.nfts.map((nft) => normalizeNftItem(nft)).filter(isTradeportItem)
    };

    return NextResponse.json(payload);
  } catch (error) {
    const payload: TradeportLofiTopResponse = {
      collection: {
        id: LOFI_COLLECTION_ID,
        slug: LOFI_COLLECTION_SLUG,
        type: LOFI_COLLECTION_TYPE,
        tradeportUrl: LOFI_TRADEPORT_URL,
        floorSui: "10",
        supply: 358
      },
      fetchedAt: new Date().toISOString(),
      animationMintFeeSui: process.env.NEXT_PUBLIC_ANIMATION_MINT_FEE_SUI ?? DEFAULT_ANIMATION_MINT_FEE_SUI,
      mostExpensive: [],
      rarest: [],
      warning: error instanceof Error ? error.message : "TradePort crawl failed"
    };

    return NextResponse.json(payload, { status: 200 });
  }
}

async function tradeportQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(TRADEPORT_GRAPHQL_URL, {
    method: "POST",
    headers: TRADEPORT_HEADERS,
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new Error(`TradePort GraphQL ${response.status}`);
  }

  const payload = (await response.json()) as TradeportGraphqlResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message ?? "GraphQL error").join("; "));
  }

  if (!payload.data?.sui) {
    throw new Error("TradePort response did not include Sui data.");
  }

  return payload.data.sui;
}

function normalizeListingItem(listing: RawListing): TradeportLofiItem | null {
  if (!listing.nft?.id || !listing.nft.name) {
    return null;
  }

  const priceMist = listing.price === null || listing.price === undefined ? null : String(listing.price);

  return normalizeNftItem(listing.nft, {
    listed: Boolean(listing.listed),
    priceMist,
    listingId: listing.id ?? null,
    marketName: listing.market_name ?? null,
    listedAt: listing.block_time ?? null
  });
}

function isTradeportItem(item: TradeportLofiItem | null): item is TradeportLofiItem {
  return Boolean(item);
}

function normalizeNftItem(
  nft: RawNft,
  listingOverride?: {
    listed: boolean;
    priceMist: string | null;
    listingId: string | null;
    marketName: string | null;
    listedAt: string | null;
  }
): TradeportLofiItem | null {
  if (!nft.id || !nft.name) {
    return null;
  }

  const firstListing = nft.listings?.[0];
  const priceMist =
    listingOverride?.priceMist ??
    (firstListing?.price === null || firstListing?.price === undefined ? null : String(firstListing.price));
  const listed = listingOverride?.listed ?? Boolean(firstListing?.listed);

  return {
    id: nft.id,
    tokenId: nft.token_id ?? nft.id,
    name: nft.name,
    imageUrl: normalizeNftImageUrl(nft.media_url ?? ""),
    mediaType: nft.media_type ?? null,
    ranking: nft.ranking ?? null,
    rarity: nft.rarity ?? null,
    owner: nft.owner ?? null,
    listed,
    priceMist,
    priceSui: mistToSuiString(priceMist),
    marketName: listingOverride?.marketName ?? firstListing?.market_name ?? null,
    listingId: listingOverride?.listingId ?? firstListing?.id ?? null,
    listedAt: listingOverride?.listedAt ?? firstListing?.block_time ?? null,
    sourceUrl: `${LOFI_TRADEPORT_URL}&modal=nft-${nft.id}`
  };
}
