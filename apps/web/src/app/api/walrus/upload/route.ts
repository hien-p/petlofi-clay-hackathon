import { NextResponse } from "next/server";
import { parsePetJson, validateSpriteAtlas } from "@/lib/petPack";
import { uploadWalrusProof } from "@/lib/walrus";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const petJsonFile = formData.get("petJson");
    const spritesheetFile = formData.get("spritesheet");

    if (!(petJsonFile instanceof File) || !(spritesheetFile instanceof File)) {
      return new NextResponse("petJson and spritesheet files are required", { status: 400 });
    }

    const petJsonRaw = await petJsonFile.text();
    const pet = parsePetJson(petJsonRaw);
    const spritesheet = new Uint8Array(await spritesheetFile.arrayBuffer());
    const sprite = validateSpriteAtlas(spritesheet);

    const walrus = await uploadWalrusProof({
      kind: "pet-pack",
      payload: {
        pet,
        sprite,
        spritesheetBytes: spritesheet.byteLength,
        uploadedAt: new Date().toISOString()
      }
    });

    return NextResponse.json({ ...walrus, pet, sprite });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Failed to upload pet pack", { status: 400 });
  }
}
