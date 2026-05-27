import { NextResponse } from "next/server";
import type { ArenaProofReceipt } from "@/lib/arena";
import { uploadWalrusProof } from "@/lib/walrus";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const receipt = (await request.json()) as ArenaProofReceipt;

    if (receipt.kind !== "arena-proof") {
      return new NextResponse("arena-proof receipt is required", { status: 400 });
    }

    if (!receipt.identity || !receipt.petId || !receipt.petName || !receipt.summary) {
      return new NextResponse("identity, petId, petName, and summary are required", { status: 400 });
    }

    const walrus = await uploadWalrusProof({
      kind: "arena-proof",
      payload: receipt
    });

    return NextResponse.json(walrus);
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Failed to save arena proof", { status: 400 });
  }
}
