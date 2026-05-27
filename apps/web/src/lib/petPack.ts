import { imageSize } from "image-size";
import { z } from "zod";

export const PET_STATES = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
] as const;

export const PET_CELL = {
  width: 192,
  height: 208,
  columns: 8,
  rows: 9,
  atlasWidth: 1536,
  atlasHeight: 1872
} as const;

export type PetState = (typeof PET_STATES)[number];

export const PET_STATE_TO_ROW: Record<PetState, number> = PET_STATES.reduce(
  (acc, state, index) => ({ ...acc, [state]: index }),
  {} as Record<PetState, number>
);

export const PetJsonSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  spritesheetPath: z.string().min(1),
  referenceUrl: z.string().url().optional(),
  states: z.array(z.enum(PET_STATES)).optional()
});

export type PetJson = z.infer<typeof PetJsonSchema>;

export type PackValidationResult = {
  ok: true;
  pet: PetJson;
  sprite: {
    width: number;
    height: number;
    mime?: string;
  };
};

export function parsePetJson(raw: string): PetJson {
  return PetJsonSchema.parse(JSON.parse(raw));
}

export function validateSpriteAtlas(bytes: Uint8Array): PackValidationResult["sprite"] {
  const dimensions = imageSize(bytes);
  if (dimensions.width !== PET_CELL.atlasWidth || dimensions.height !== PET_CELL.atlasHeight) {
    throw new Error(
      `Spritesheet must be ${PET_CELL.atlasWidth}x${PET_CELL.atlasHeight}; received ${dimensions.width ?? "unknown"}x${
        dimensions.height ?? "unknown"
      }`
    );
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    mime: dimensions.type
  };
}

export function assertPetState(value: string): PetState {
  if ((PET_STATES as readonly string[]).includes(value)) {
    return value as PetState;
  }

  throw new Error(`Unsupported pet state: ${value}`);
}
