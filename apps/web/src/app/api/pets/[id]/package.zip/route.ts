import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const safeId = id.replace(/[^a-z0-9-]/gi, "");
  const petsDir = process.env.PETLOFI_PETS_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "public", "pets");
  const baseDir = path.join(petsDir, safeId || "lofi-yeti");
  const fallbackDir = path.join(petsDir, "lofi-yeti");
  const petDir = await exists(baseDir) ? baseDir : fallbackDir;

  const [petJson, spritesheet, contactSheet] = await Promise.all([
    fs.readFile(path.join(petDir, "pet.json")),
    fs.readFile(path.join(petDir, "spritesheet.webp")),
    readOptionalFile(path.join(petDir, "contact-sheet.webp"))
  ]);

  const zip = new JSZip();
  zip.file("pet.json", petJson);
  zip.file("spritesheet.webp", spritesheet);
  if (contactSheet) {
    zip.file("contact-sheet.webp", contactSheet);
  }
  zip.file(
    "README.md",
    [
      "# PetLofi Codex Pet Pack",
      "",
      "Move this folder into `~/.codex/pets/` or install it through the PetLofi app.",
      "The pack follows the Codex pet contract: `pet.json` plus `spritesheet.webp`."
    ].join("\n")
  );

  const body = await zip.generateAsync({ type: "uint8array" });
  const arrayBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new NextResponse(arrayBuffer, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${safeId || "lofi-yeti"}-petlofi-pack.zip"`
    }
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalFile(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}
