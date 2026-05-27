"use client";

import { useEffect, useState } from "react";
import { PET_CELL, PET_STATE_TO_ROW, type PetState } from "@/lib/petPack";

type PetSpriteProps = {
  state: PetState;
  src?: string;
  scale?: number;
  hue?: number;
};

export function PetSprite({ state, src = "/pets/lofi-yeti/spritesheet.webp?v=lofi-reference-v3", scale = 1.35, hue = 0 }: PetSpriteProps) {
  const [frame, setFrame] = useState(0);
  const row = PET_STATE_TO_ROW[state];
  const width = Math.round(PET_CELL.width * scale);
  const height = Math.round(PET_CELL.height * scale);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrame((current) => (current + 1) % PET_CELL.columns);
    }, state === "idle" ? 260 : 150);

    return () => window.clearInterval(interval);
  }, [state]);

  return (
    <div
      className="pet-sprite"
      aria-label={`Pet animation state: ${state}`}
      style={{
        width,
        height,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${PET_CELL.atlasWidth * scale}px ${PET_CELL.atlasHeight * scale}px`,
        backgroundPosition: `-${frame * width}px -${row * height}px`,
        filter: hue ? `hue-rotate(${hue}deg) saturate(1.2)` : undefined
      }}
    />
  );
}
