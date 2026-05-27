import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "apps", "web", "public", "pets", "lofi-yeti");
const spritesheet = path.join(out, "spritesheet.webp");

const pet = {
  id: "lofi-yeti",
  displayName: "CLAY Lofi Yeti",
  description: "A mintable full-body Lofi Yeti companion animated from a hatch-pet reference sheet for Sui agent work.",
  spritesheetPath: "spritesheet.webp",
  referenceUrl: "https://hackathon.lofitheyeti.com/",
  hatchRun: "lofi-yeti-v3",
  states: ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]
};

await mkdir(out, { recursive: true });

try {
  await stat(spritesheet);
} catch {
  throw new Error(`Missing ${spritesheet}. Run the hatch-pet workflow before refreshing pet.json.`);
}

const metadata = await sharp(spritesheet).metadata();
if (metadata.width !== 1536 || metadata.height !== 1872) {
  throw new Error(`Expected a 1536x1872 Codex pet atlas, got ${metadata.width}x${metadata.height}.`);
}

await writeFile(path.join(out, "pet.json"), `${JSON.stringify(pet, null, 2)}\n`);
console.log(`Pet pack ready: ${spritesheet}`);
