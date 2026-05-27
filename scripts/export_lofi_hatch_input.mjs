#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packId = args["pack-id"];

  if (!packId) {
    throw new Error("Usage: pnpm lofi:hatch-input -- --pack-id <pack-id> [--pets-dir <dir>] [--out <dir>]");
  }

  const petsDir = path.resolve(rootDir, args["pets-dir"] ?? "apps/web/public/pets");
  const packDir = path.join(petsDir, sanitizePackId(packId));
  const outDir = path.resolve(rootDir, args.out ?? path.join("tmp", "hatch-pet-input", sanitizePackId(packId)));

  await assertDirectory(packDir);
  await fs.mkdir(outDir, { recursive: true });

  const petJsonPath = path.join(packDir, "pet.json");
  const petJson = JSON.parse(await fs.readFile(petJsonPath, "utf8"));
  const sourcePath = await firstExisting([
    path.join(packDir, "source-image.png"),
    path.join(packDir, "source-image"),
    path.join(packDir, "source-fallback.png")
  ]);

  if (!sourcePath) {
    throw new Error(`No source image found in ${packDir}. Generate the pack first or place source-image.png there.`);
  }

  const sourceFileName = path.basename(sourcePath) === "source-fallback.png" ? "source-fallback.png" : "source.png";
  const contactSheetPath = path.join(packDir, "contact-sheet.webp");

  await fs.copyFile(sourcePath, path.join(outDir, sourceFileName));
  await fs.copyFile(petJsonPath, path.join(outDir, "pet.json"));
  if (await exists(contactSheetPath)) {
    await fs.copyFile(contactSheetPath, path.join(outDir, "contact-sheet.webp"));
  }

  await fs.writeFile(path.join(outDir, "README.md"), buildReadme({ packId, petJson, sourceFileName }), "utf8");

  console.log(`hatch_input_dir=${outDir}`);
  console.log(`source=${path.join(outDir, sourceFileName)}`);
  console.log(`expected_refined_output=${path.join(packDir, "refined-spritesheet.webp")}`);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1]?.startsWith("--") ? "" : argv[index + 1];
    values[key] = value ?? "";
    if (value) {
      index += 1;
    }
  }
  return values;
}

function sanitizePackId(packId) {
  return packId.replace(/[^a-z0-9-]/gi, "");
}

async function assertDirectory(dir) {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Pack folder does not exist: ${dir}`);
  }
}

async function firstExisting(paths) {
  for (const filePath of paths) {
    if (await exists(filePath)) {
      return filePath;
    }
  }
  return null;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildReadme({ packId, petJson, sourceFileName }) {
  const displayName = typeof petJson.displayName === "string" ? petJson.displayName : packId;
  const sourceOrigin = typeof petJson.sourceOrigin === "string" ? petJson.sourceOrigin : "unknown";
  const sourceTokenId = typeof petJson.sourceTokenId === "string" ? petJson.sourceTokenId : "unknown";

  return [
    `# ${displayName} Hatch-Pet Input`,
    "",
    "This folder is the offline refinement handoff for the PetLofi top-10 Lofi pipeline.",
    "",
    `- Pack ID: ${packId}`,
    `- Token ID: ${sourceTokenId}`,
    `- Source origin: ${sourceOrigin}`,
    `- Source image: ${sourceFileName}`,
    "",
    "Run the hatch-pet workflow using the source image as the character reference. When the refined atlas is ready, copy it back to:",
    "",
    `\`apps/web/public/pets/${packId}/refined-spritesheet.webp\``,
    "",
    "Then stage the selected token with `{ refine: true }` through `POST /api/lofi/generated`. The route will replace only this pack's `spritesheet.webp` and mark `generationMode` as `hatch-refined`.",
    ""
  ].join("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
