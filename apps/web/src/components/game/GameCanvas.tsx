"use client";

import type Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { createPetLofiScenes } from "./scenes";
import type { GameCallbacks, GameCanvasProps } from "./types";

const COMMAND_EVENT = "petlofi:command";

export function GameCanvas({
  scene,
  petState,
  petVariant,
  petAtlas,
  activeZone,
  friends,
  mapRevision,
  command,
  commandNonce,
  onZoneChange,
  onAction,
  onPetStateChange,
  onCuddleAttack,
  onArenaTick,
  onArenaComplete
}: GameCanvasProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef<GameCallbacks>({});
  const [isReady, setIsReady] = useState(false);
  const [bootError, setBootError] = useState("");

  callbacksRef.current = {
    onZoneChange,
    onAction,
    onPetStateChange,
    onCuddleAttack,
    onArenaTick,
    onArenaComplete
  };

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;

    async function bootGame() {
      if (!parentRef.current || gameRef.current) {
        return;
      }

      try {
        const phaserModule = await import("phaser");
        if (cancelled || !parentRef.current) {
          return;
        }

        const PhaserRuntime = (phaserModule.default ?? phaserModule) as unknown as typeof Phaser;
        const { ArenaScene, VillageScene, callbacksKey } = createPetLofiScenes(PhaserRuntime);
        const firstScene = scene === "arena" ? [ArenaScene, VillageScene] : [VillageScene, ArenaScene];
        const config: Phaser.Types.Core.GameConfig = {
          type: PhaserRuntime.AUTO,
          parent: parentRef.current,
          backgroundColor: "#031017",
          render: {
            antialias: true,
            pixelArt: false,
            roundPixels: true
          },
          scale: {
            mode: PhaserRuntime.Scale.RESIZE,
            autoCenter: PhaserRuntime.Scale.CENTER_BOTH,
            width: 1920,
            height: 1080
          },
          scene: firstScene
        };

        game = new PhaserRuntime.Game(config);
        game.registry.set(callbacksKey, callbacksRef);
        gameRef.current = game;
        setBootError("");
        setIsReady(true);

        window.setTimeout(() => {
          game?.events.emit(COMMAND_EVENT, { type: "syncMap", friends, mapRevision });
          game?.events.emit(COMMAND_EVENT, { type: "setPetAtlas", atlas: petAtlas ?? null });
          game?.events.emit(COMMAND_EVENT, { type: "setPetVariant", variant: petVariant ?? null });
          game?.events.emit(COMMAND_EVENT, { type: "setPetState", petState });
          if (activeZone) {
            game?.events.emit(COMMAND_EVENT, { type: "goToZone", zoneId: activeZone });
          }
        }, 120);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Phaser boot failed";
        console.error("PetLofi Phaser boot failed", error);
        setBootError(message);
      }
    }

    void bootGame();

    return () => {
      cancelled = true;
      setIsReady(false);
      if (game) {
        game.destroy(true);
      }
      if (gameRef.current === game) {
        gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) {
      return;
    }

    game.events.emit(COMMAND_EVENT, { type: "setScene", scene });
    window.setTimeout(() => {
      game.events.emit(COMMAND_EVENT, { type: "setPetAtlas", atlas: petAtlas ?? null });
      game.events.emit(COMMAND_EVENT, { type: "setPetState", petState });
    }, 80);
  }, [scene, petState, petAtlas]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) {
      return;
    }

    game.events.emit(COMMAND_EVENT, { type: "setPetAtlas", atlas: petAtlas ?? null });
  }, [petAtlas]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) {
      return;
    }

    game.events.emit(COMMAND_EVENT, { type: "setPetVariant", variant: petVariant ?? null });
  }, [petVariant]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) {
      return;
    }

    game.events.emit(COMMAND_EVENT, { type: "syncMap", friends, mapRevision });
  }, [friends, mapRevision]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || !command) {
      return;
    }

    game.events.emit(COMMAND_EVENT, command);
  }, [command, commandNonce]);

  return (
    <div className="game-canvas" ref={parentRef} aria-label="PetLofi animated game canvas">
      {!isReady && <div className="game-canvas-loading">{bootError || "Loading PetLofi arena..."}</div>}
    </div>
  );
}
