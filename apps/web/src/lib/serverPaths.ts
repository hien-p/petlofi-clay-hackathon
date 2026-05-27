import path from "node:path";

export function dataDir(): string {
  return process.env.PETLOFI_DATA_DIR ?? path.join(process.cwd(), ".petlofi");
}

export function walrusDir(): string {
  return path.join(dataDir(), "walrus");
}
