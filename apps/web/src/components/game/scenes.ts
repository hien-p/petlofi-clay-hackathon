import type Phaser from "phaser";
import {
  ARENA_CUDDLE_COOLDOWN_MS,
  createArenaRunSnapshot,
  createIdleArenaSnapshot,
  completeArenaRun,
  type ArenaRunSnapshot,
  type ArenaRunSummary
} from "@/lib/arena";
import type { PetState } from "@/lib/petPack";
import type { GameCallbacks, GameCommand, GameFriend, GameHotspotId, GamePetAtlas, GamePetVariant } from "./types";

type PhaserRuntime = typeof Phaser;

const COMMAND_EVENT = "petlofi:command";
const CALLBACKS_KEY = "petlofi:callbacks";
const PET_TEXTURE = "petlofi-lofi-yeti";
const PET_ATLAS_URL = "/pets/lofi-yeti/spritesheet.webp?v=lofi-reference-v3";
const VILLAGE_WORLD = {
  width: 3600,
  height: 2400,
  tile: 48
} as const;
const PET_STATES: PetState[] = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
];

const VILLAGE_HOTSPOTS: Array<{
  id: GameHotspotId;
  title: string;
  label: string;
  kind: "gate" | "forge" | "vault" | "library" | "rest" | "feed" | "gallery";
  x: number;
  y: number;
  standX: number;
  standY: number;
}> = [
  { id: "suins-gate", title: "SuiNS Gate", label: "Name", kind: "gate", x: 33, y: 42, standX: 34, standY: 53 },
  { id: "agent-forge", title: "Agent Forge", label: "Work", kind: "forge", x: 67, y: 39, standX: 67, standY: 51 },
  { id: "walrus-vault", title: "Walrus Vault", label: "Proof", kind: "vault", x: 73, y: 70, standX: 72, standY: 82 },
  { id: "memwal-library", title: "MemWal Library", label: "Memory", kind: "library", x: 35, y: 77, standX: 36, standY: 89 },
  { id: "rest-hut", title: "Rest Hut", label: "Rest", kind: "rest", x: 24, y: 71, standX: 24, standY: 83 },
  { id: "feed-stall", title: "Treat Stall", label: "Feed", kind: "feed", x: 52, y: 56, standX: 52, standY: 68 },
  { id: "petdex", title: "Petdex Gallery", label: "Gallery", kind: "gallery", x: 76, y: 86, standX: 75, standY: 95 }
];

export function createPetLofiScenes(PhaserLib: PhaserRuntime) {
  const arenaKey = "PetLofiArenaScene";
  const villageKey = "PetLofiVillageScene";

  class PetLofiBaseScene extends PhaserLib.Scene {
    protected petRoot?: Phaser.GameObjects.Container;
    protected pet?: Phaser.GameObjects.Sprite;
    protected activeState: PetState = "idle";
    protected moveTween?: Phaser.Tweens.Tween;
    protected bobTween?: Phaser.Tweens.Tween;
    protected moveVector = { dx: 0, dy: 0 };
    protected continuousMoveActive = false;
    protected lastContinuousActionAt = 0;
    protected velX = 0;
    protected velY = 0;
    protected petVariant: GamePetVariant | null = null;
    protected petAtlas: GamePetAtlas | null = null;
    protected activePetTexture = PET_TEXTURE;

    constructor(key: string) {
      super({ key });
    }

    preload() {
      if (!this.textures.exists(PET_TEXTURE)) {
        this.load.spritesheet(PET_TEXTURE, PET_ATLAS_URL, {
          frameWidth: 192,
          frameHeight: 208
        });
      }
    }

    protected installCommandBridge() {
      this.game.events.off(COMMAND_EVENT, this.handleCommand, this);
      this.game.events.on(COMMAND_EVENT, this.handleCommand, this);
      this.events.once("shutdown", () => {
        this.game.events.off(COMMAND_EVENT, this.handleCommand, this);
      });
    }

    protected createPetAnimations() {
      PET_STATES.forEach((state, row) => {
        const key = this.animationKey(state);
        if (this.anims.exists(key)) {
          return;
        }

        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(this.activePetTexture, {
            start: row * 8,
            end: row * 8 + 7
          }),
          frameRate: state === "idle" ? 4 : state === "review" ? 5 : 8,
          repeat: -1
        });
      });
    }

    protected createPet(x: number, y: number, scale: number) {
      this.petRoot?.destroy(true);
      this.petRoot = this.add.container(x, y);

      const shadow = this.add.ellipse(0, 13, 92, 27, 0x062b33, 0.24);
      this.pet = this.add.sprite(0, 0, this.activePetTexture).setOrigin(0.5, 0.82).setScale(scale);
      const petHeadTop = -208 * 0.82 * scale;
      const name = this.add
        .text(0, petHeadTop - Math.max(8, 12 * scale), "@clay-builder", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(16, Math.round(25 * scale))}px`,
          color: "#93f5c8",
          backgroundColor: "#082c32",
          padding: { x: 9, y: 5 },
          stroke: "#031017",
          strokeThickness: 4
        })
        .setOrigin(0.5, 1);

      this.petRoot.add([shadow, this.pet, name]);
      this.petRoot.setSize(140, 160);
      this.petRoot.setInteractive(
        new PhaserLib.Geom.Rectangle(-70, petHeadTop - 50, 140, Math.abs(petHeadTop) + 92),
        PhaserLib.Geom.Rectangle.Contains
      );
      this.petRoot.on("pointerdown", () => this.onPetPressed());
      this.setPetState(this.activeState, false);
      this.applyPetVariant();
      this.syncPetDepth();
      this.startIdleBob();
      return this.petRoot;
    }

    protected startIdleBob() {
      if (!this.pet) {
        return;
      }

      this.bobTween?.stop();
      this.pet.y = 0;
      this.bobTween = this.tweens.add({
        targets: this.pet,
        y: -7,
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    protected startWalkBob() {
      if (!this.pet) {
        return;
      }

      this.bobTween?.stop();
      this.pet.y = 0;
      this.bobTween = this.tweens.add({
        targets: this.pet,
        y: -13,
        duration: 160,
        yoyo: true,
        repeat: -1,
        ease: "Quad.easeOut"
      });
    }

    protected setPetState(state: PetState, emit = true) {
      this.activeState = state;
      this.pet?.play(this.animationKey(state), true);
      if (emit) {
        this.callbacks().onPetStateChange?.(state);
      }
    }

    protected movePetTo(x: number, y: number, state: PetState = "running", duration = 620) {
      if (!this.petRoot) {
        return;
      }

      this.moveTween?.stop();
      this.setPetState(state);
      this.startWalkBob();
      this.moveTween = this.tweens.add({
        targets: this.petRoot,
        x,
        y,
        duration,
        ease: "Sine.easeInOut",
        onUpdate: () => this.syncPetDepth(),
        onComplete: () => {
          this.syncPetDepth();
          this.setPetState("idle");
          this.startIdleBob();
        }
      });
    }

    protected syncPetDepth() {
      if (this.petRoot) {
        this.petRoot.setDepth(Math.round(this.petRoot.y + 40));
      }
    }

    protected callbacks(): GameCallbacks {
      const ref = this.registry.get(CALLBACKS_KEY) as { current?: GameCallbacks } | undefined;
      return ref?.current ?? {};
    }

    protected emitAction(action: string) {
      this.callbacks().onAction?.(action);
    }

    protected animationKey(state: PetState) {
      return `petlofi-${this.activePetTexture}-${state}`;
    }

    protected pct(x: number, y: number) {
      return {
        x: (this.scale.width * x) / 100,
        y: (this.scale.height * y) / 100
      };
    }

    protected boundedPoint(x: number, y: number) {
      return {
        x: PhaserLib.Math.Clamp(x, 86, this.scale.width - 86),
        y: PhaserLib.Math.Clamp(y, 150, this.scale.height - 84)
      };
    }

    protected handleCommand(command: GameCommand) {
      if (command.type === "setScene") {
        const targetKey = command.scene === "arena" ? arenaKey : villageKey;
        if (this.scene.key !== targetKey) {
          this.scene.start(targetKey);
        }
        return;
      }

      if (command.type === "syncMap") {
        this.syncMapState(command.friends, command.mapRevision);
        return;
      }

      if (command.type === "setPetState") {
        this.setPetState(command.petState, false);
        if (command.petState === "running" || command.petState === "running-left" || command.petState === "running-right") {
          this.startWalkBob();
          this.time.delayedCall(520, () => this.startIdleBob());
        }
        return;
      }

      if (command.type === "setPetVariant") {
        this.petVariant = command.variant;
        this.applyPetVariant();
        return;
      }

      if (command.type === "setPetAtlas") {
        this.setPetAtlas(command.atlas);
        return;
      }

      if (command.type === "move") {
        this.nudgePet(command.dx, command.dy);
        return;
      }

      if (command.type === "setMoveVector") {
        this.setMoveVector(command.dx, command.dy);
        return;
      }

      if (command.type === "goToZone") {
        this.goToZone(command.zoneId);
        return;
      }

      if (command.type === "startArenaRun") {
        this.startArenaRun();
        return;
      }

      if (command.type === "resetArenaRun") {
        this.resetArenaRun();
        return;
      }

      if (command.type === "chargeAgentSpecial") {
        this.chargeAgentSpecial();
        return;
      }

      this.cuddleAttack();
    }

    protected nudgePet(dx: number, dy: number) {
      if (!this.petRoot) {
        return;
      }

      const next = this.boundedPoint(this.petRoot.x + dx * 10, this.petRoot.y + dy * 7);
      const state = dx < 0 ? "running-left" : dx > 0 ? "running-right" : "running";
      this.movePetTo(next.x, next.y, state, 280);
      this.emitAction("free_walk");
    }

    protected setMoveVector(dx: number, dy: number) {
      const magnitude = Math.hypot(dx, dy);
      const wasMoving = this.continuousMoveActive;

      if (!magnitude) {
        this.moveVector = { dx: 0, dy: 0 };
        this.continuousMoveActive = false;
        if (wasMoving) {
          this.moveTween?.stop();
          this.syncPetDepth();
          this.setPetState("idle");
          this.startIdleBob();
        }
        return;
      }

      this.moveVector = {
        dx: dx / Math.max(1, magnitude),
        dy: dy / Math.max(1, magnitude)
      };
      this.continuousMoveActive = true;
      this.moveTween?.stop();
      this.setPetState(dx < 0 ? "running-left" : dx > 0 ? "running-right" : "running");
      this.startWalkBob();
    }

    protected updateContinuousMovement(time: number, delta: number, action: string) {
      if (!this.petRoot) {
        return;
      }

      const speed = this.continuousMoveSpeed();
      const targetVX = this.continuousMoveActive ? this.moveVector.dx * speed.x : 0;
      const targetVY = this.continuousMoveActive ? this.moveVector.dy * speed.y : 0;

      // Exponential smoothing so accel/decel feel like gliding instead of snapping.
      const k = 1 - Math.exp(-(delta / 1000) * 16);
      this.velX += (targetVX - this.velX) * k;
      this.velY += (targetVY - this.velY) * k;

      // Idle: not holding and basically stopped — clamp to rest and skip.
      if (!this.continuousMoveActive && Math.hypot(this.velX, this.velY) < 4) {
        this.velX = 0;
        this.velY = 0;
        return;
      }

      const next = this.boundedPoint(
        this.petRoot.x + this.velX * (delta / 1000),
        this.petRoot.y + this.velY * (delta / 1000)
      );
      this.petRoot.setPosition(next.x, next.y);
      this.syncPetDepth();

      if (this.continuousMoveActive && time - this.lastContinuousActionAt > 280) {
        this.emitAction(action);
        this.lastContinuousActionAt = time;
      }
    }

    protected continuousMoveSpeed() {
      return { x: 560, y: 430 };
    }

    protected goToZone(_zoneId: GameHotspotId) {
      // Scenes that have zones override this.
    }

    protected cuddleAttack() {
      // Arena overrides this.
    }

    protected startArenaRun() {
      // Arena overrides this.
    }

    protected resetArenaRun() {
      // Arena overrides this.
    }

    protected chargeAgentSpecial() {
      // Arena overrides this.
    }

    protected applyPetVariant() {
      if (!this.pet) {
        return;
      }

      if (!this.petVariant) {
        this.pet.clearTint();
        return;
      }

      this.pet.setTint(this.petVariant.tintHex, this.petVariant.accentHex, this.petVariant.tintHex, this.petVariant.accentHex);
    }

    protected setPetAtlas(atlas: GamePetAtlas | null) {
      this.petAtlas = atlas;
      const nextTexture = atlas?.textureKey ?? PET_TEXTURE;
      const spritesheetUrl = atlas?.spritesheetUrl ?? PET_ATLAS_URL;

      if (this.activePetTexture === nextTexture && this.textures.exists(nextTexture)) {
        this.applyPetTexture();
        return;
      }

      if (this.textures.exists(nextTexture)) {
        this.activePetTexture = nextTexture;
        this.createPetAnimations();
        this.applyPetTexture();
        return;
      }

      this.load.spritesheet(nextTexture, spritesheetUrl, {
        frameWidth: 192,
        frameHeight: 208
      });
      this.load.once("complete", () => {
        if (!this.textures.exists(nextTexture)) {
          return;
        }
        this.activePetTexture = nextTexture;
        this.createPetAnimations();
        this.applyPetTexture();
      });
      this.load.start();
    }

    protected applyPetTexture() {
      if (!this.pet) {
        return;
      }

      this.pet.setTexture(this.activePetTexture);
      this.setPetState(this.activeState, false);
      this.applyPetVariant();
    }

    protected onPetPressed() {
      this.cuddleAttack();
    }

    protected syncMapState(_friends: GameFriend[], _mapRevision: number) {
      // The village scene applies map-contract patches. Arena ignores them.
    }
  }

  type ArenaEnemyActor = {
    root: Phaser.GameObjects.Container;
    speed: number;
    hitReadyAt: number;
    alive: boolean;
  };

  type ArenaSnackActor = {
    root: Phaser.GameObjects.Container;
    collected: boolean;
  };

  class ArenaScene extends PetLofiBaseScene {
    private motion?: Phaser.GameObjects.Graphics;
    private enemyRoots: ArenaEnemyActor[] = [];
    private snackRoots: ArenaSnackActor[] = [];
    private lockedRoots: Phaser.GameObjects.Container[] = [];
    private arenaSnapshot: ArenaRunSnapshot = createIdleArenaSnapshot();
    private runStartedAtMs = 0;
    private lastTickEmitAt = 0;
    private lastSpawnAt = 0;
    private nextCuddleAt = 0;
    private specialCharged = false;
    private specialUsed = false;
    private completedRun = false;
    private animationStates: PetState[] = ["idle"];

    constructor() {
      super(arenaKey);
    }

    create() {
      this.enemyRoots = [];
      this.snackRoots = [];
      this.lockedRoots = [];
      this.arenaSnapshot = createIdleArenaSnapshot();
      this.runStartedAtMs = 0;
      this.lastTickEmitAt = 0;
      this.lastSpawnAt = 0;
      this.nextCuddleAt = 0;
      this.specialCharged = false;
      this.specialUsed = false;
      this.completedRun = false;
      this.animationStates = ["idle"];
      this.createPetAnimations();
      this.installCommandBridge();
      this.drawStaticArena();
      this.motion = this.add.graphics().setDepth(3);
      const petPoint = this.pct(20, 48);
      this.createPet(petPoint.x, petPoint.y, this.petScale(0.72));
      this.petRoot?.setDepth(80);
      this.createLockedCompanions();
      this.createEnemies();
      this.createSnacks();
      this.createArenaCopy();
      this.input.keyboard?.on("keydown-SPACE", () => this.cuddleAttack());
      // Only rebuild the scene on resize when a run isn't in progress, so resizing
      // (or opening devtools) never wipes an active Cuddle Arena run.
      this.scale.on("resize", () => {
        if (this.arenaSnapshot?.phase !== "running") {
          this.scene.restart();
        }
      });
    }

    update(time: number, delta: number) {
      this.updateContinuousMovement(time, delta, "arena_dodge");
      this.drawArenaMotion(time);
      this.updateArenaRun(time, delta);
      this.enemyRoots.forEach((enemy, index) => {
        enemy.root.rotation = Math.sin(time / 820 + index) * 0.035;
      });
      this.snackRoots.forEach((snack, index) => {
        if (!snack.collected) {
          snack.root.y += Math.sin(time / 460 + index) * 0.018;
        }
      });
    }

    protected override nudgePet(dx: number, dy: number) {
      if (!this.petRoot) {
        return;
      }

      const next = this.boundedPoint(this.petRoot.x + dx * 12, this.petRoot.y + dy * 8);
      const state = dx < 0 ? "running-left" : dx > 0 ? "running-right" : "running";
      this.movePetTo(next.x, next.y, state, 240);
      this.emitAction("arena_dodge");
    }

    protected override continuousMoveSpeed() {
      return { x: 660, y: 520 };
    }

    protected override startArenaRun() {
      if (!this.petRoot) {
        return;
      }

      this.clearArenaActors();
      this.runStartedAtMs = Date.now();
      this.arenaSnapshot = createArenaRunSnapshot(this.runStartedAtMs);
      this.specialCharged = false;
      this.specialUsed = false;
      this.completedRun = false;
      this.nextCuddleAt = 0;
      this.lastTickEmitAt = 0;
      this.lastSpawnAt = this.time.now;
      this.animationStates = ["running"];
      this.setPetState("running");
      this.startWalkBob();
      this.emitAction("arena_run_started");
      this.spawnEnemyWave(5);
      this.spawnSnackWave(4);
      this.emitArenaTick();
    }

    protected override resetArenaRun() {
      this.clearArenaActors();
      this.arenaSnapshot = createIdleArenaSnapshot();
      this.runStartedAtMs = 0;
      this.lastTickEmitAt = 0;
      this.lastSpawnAt = 0;
      this.nextCuddleAt = 0;
      this.specialCharged = false;
      this.specialUsed = false;
      this.completedRun = false;
      this.animationStates = ["idle"];
      this.setPetState("idle");
      this.startIdleBob();
      this.createEnemies();
      this.createSnacks();
      this.emitArenaTick();
      this.emitAction("arena_replay_ready");
    }

    protected override chargeAgentSpecial() {
      if (this.arenaSnapshot.phase !== "running") {
        this.specialCharged = true;
        this.arenaSnapshot = { ...this.arenaSnapshot, specialCharged: true };
        this.emitArenaTick();
        this.emitAction("arena_special_queued");
        return;
      }

      this.specialCharged = true;
      this.arenaSnapshot = { ...this.arenaSnapshot, specialCharged: true };
      this.setPetState("review");
      this.trackArenaState("review");
      this.createSparkle(this.petRoot?.x ?? this.scale.width / 2, (this.petRoot?.y ?? this.scale.height / 2) - 70);
      this.time.delayedCall(520, () => {
        if (this.arenaSnapshot.phase === "running") {
          this.setPetState("running");
          this.trackArenaState("running");
        }
      });
      this.emitArenaTick();
      this.emitAction("arena_agent_special_charged");
    }

    protected override cuddleAttack() {
      if (!this.petRoot) {
        return;
      }

      if (this.arenaSnapshot.phase !== "running") {
        this.emitAction("arena_cuddle_idle");
        this.createBurst(this.petRoot.x, this.petRoot.y - 52, 0.75);
        return;
      }

      const now = this.time.now;
      if (now < this.nextCuddleAt && !this.specialCharged) {
        this.emitArenaTick();
        return;
      }

      const isSpecial = this.specialCharged;
      const radius = isSpecial ? Math.max(this.scale.width, this.scale.height) : 230;
      const cleared = this.clearEnemiesNear(this.petRoot.x, this.petRoot.y, radius);
      this.specialCharged = false;
      this.specialUsed = this.specialUsed || isSpecial;
      this.nextCuddleAt = now + ARENA_CUDDLE_COOLDOWN_MS;
      this.arenaSnapshot = {
        ...this.arenaSnapshot,
        score: this.arenaSnapshot.score + cleared * (isSpecial ? 35 : 25) + (isSpecial ? 60 : 10),
        enemiesCleared: this.arenaSnapshot.enemiesCleared + cleared,
        cuddleReady: false,
        specialCharged: false
      };
      this.setPetState("jumping");
      this.trackArenaState("jumping");
      this.callbacks().onCuddleAttack?.();
      this.emitAction(isSpecial ? "arena_agent_special" : "arena_cuddle_attack");
      this.createBurst(this.petRoot.x, this.petRoot.y - 52, isSpecial ? 1.55 : 1);
      if (cleared > 0 || isSpecial) {
        this.cameras.main.shake(isSpecial ? 320 : 150, isSpecial ? 0.012 : 0.006);
        this.cameras.main.flash(isSpecial ? 220 : 120, 147, 245, 200, false);
      }
      this.emitArenaTick();
      this.time.delayedCall(720, () => {
        if (this.arenaSnapshot.phase === "running") {
          this.setPetState("running");
          this.trackArenaState("running");
          this.startWalkBob();
        } else {
          this.setPetState("waving");
          this.trackArenaState("waving");
          this.startIdleBob();
        }
      });
    }

    private updateArenaRun(time: number, delta: number) {
      if (this.arenaSnapshot.phase !== "running" || this.completedRun) {
        return;
      }

      const endsAtMs = this.arenaSnapshot.endsAt ? new Date(this.arenaSnapshot.endsAt).getTime() : Date.now();
      const nextTimeLeftMs = Math.max(0, endsAtMs - Date.now());
      this.arenaSnapshot = {
        ...this.arenaSnapshot,
        timeLeftMs: nextTimeLeftMs,
        cuddleReady: time >= this.nextCuddleAt,
        specialCharged: this.specialCharged
      };

      this.updateEnemyDrift(time, delta);
      this.collectTouchedSnacks();

      const aliveCount = this.enemyRoots.filter((enemy) => enemy.alive).length;
      if (time - this.lastSpawnAt > 3200 && aliveCount < 9) {
        this.spawnEnemyWave(1 + Math.floor(this.arenaSnapshot.score / 220));
        this.lastSpawnAt = time;
      }

      if (this.snackRoots.filter((snack) => !snack.collected).length < 2) {
        this.spawnSnackWave(1);
      }

      if (this.arenaSnapshot.safety <= 0) {
        this.finishArenaRun("failed");
        return;
      }

      if (this.arenaSnapshot.timeLeftMs <= 0) {
        this.finishArenaRun("victory");
        return;
      }

      if (time - this.lastTickEmitAt > 220) {
        this.emitArenaTick();
        this.lastTickEmitAt = time;
      }
    }

    private updateEnemyDrift(time: number, delta: number) {
      if (!this.petRoot) {
        return;
      }

      this.enemyRoots.forEach((enemy) => {
        if (!enemy.alive) {
          return;
        }

        const dx = this.petRoot!.x - enemy.root.x;
        const dy = this.petRoot!.y - enemy.root.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        enemy.root.x += (dx / distance) * enemy.speed * (delta / 1000);
        enemy.root.y += (dy / distance) * enemy.speed * (delta / 1000);

        if (distance < 56 && time >= enemy.hitReadyAt) {
          enemy.hitReadyAt = time + 1100;
          this.arenaSnapshot = {
            ...this.arenaSnapshot,
            safety: Math.max(0, this.arenaSnapshot.safety - 12),
            hitsTaken: this.arenaSnapshot.hitsTaken + 1
          };
          this.setPetState("failed");
          this.trackArenaState("failed");
          this.createHitFlash(this.petRoot!.x, this.petRoot!.y - 44);
          this.cameras.main.shake(170, 0.009);
          this.time.delayedCall(360, () => {
            if (this.arenaSnapshot.phase === "running") {
              this.setPetState("running");
              this.trackArenaState("running");
            }
          });
        }
      });
    }

    private collectTouchedSnacks() {
      if (!this.petRoot) {
        return;
      }

      this.snackRoots.forEach((snack) => {
        if (snack.collected) {
          return;
        }

        const distance = Math.hypot(this.petRoot!.x - snack.root.x, this.petRoot!.y - snack.root.y);
        if (distance < 64) {
          this.collectSnack(snack.root);
        }
      });
    }

    private collectSnack(root: Phaser.GameObjects.Container) {
      const snack = this.snackRoots.find((item) => item.root === root);
      if (!snack || snack.collected) {
        return;
      }

      snack.collected = true;
      this.arenaSnapshot = {
        ...this.arenaSnapshot,
        score: this.arenaSnapshot.score + 40,
        safety: Math.min(100, this.arenaSnapshot.safety + 8),
        snacksCollected: this.arenaSnapshot.snacksCollected + 1
      };
      this.createSparkle(root.x, root.y);
      this.emitAction("snack_pickup");
      this.setPetState("waving");
      this.trackArenaState("waving");
      this.tweens.add({
        targets: root,
        alpha: 0,
        scale: 1.4,
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => root.destroy(true)
      });
      this.time.delayedCall(360, () => {
        if (this.arenaSnapshot.phase === "running") {
          this.setPetState("running");
          this.trackArenaState("running");
        }
      });
      this.emitArenaTick();
    }

    private clearEnemiesNear(x: number, y: number, radius: number) {
      let cleared = 0;
      this.enemyRoots.forEach((enemy) => {
        if (!enemy.alive) {
          return;
        }

        const distance = Math.hypot(enemy.root.x - x, enemy.root.y - y);
        if (distance <= radius) {
          enemy.alive = false;
          cleared += 1;
          this.tweens.add({
            targets: enemy.root,
            x: enemy.root.x + (enemy.root.x < x ? -58 : 58),
            y: enemy.root.y - 36,
            alpha: 0,
            scale: 0.25,
            duration: 300,
            ease: "Back.easeIn",
            onComplete: () => enemy.root.destroy(true)
          });
        }
      });
      return cleared;
    }

    private finishArenaRun(outcome: "victory" | "failed") {
      if (this.completedRun) {
        return;
      }

      this.completedRun = true;
      this.continuousMoveActive = false;
      this.moveVector = { dx: 0, dy: 0 };
      this.arenaSnapshot = {
        ...this.arenaSnapshot,
        phase: outcome,
        timeLeftMs: outcome === "victory" ? 0 : this.arenaSnapshot.timeLeftMs,
        cuddleReady: false,
        specialCharged: false
      };
      const nextState: PetState = outcome === "victory" ? "jumping" : "failed";
      this.setPetState(nextState);
      this.trackArenaState(nextState);
      if (outcome === "victory" && this.petRoot) {
        this.createBurst(this.petRoot.x, this.petRoot.y - 58, 1.3);
      }
      const summary = completeArenaRun(this.arenaSnapshot, Date.now(), this.specialUsed, this.animationStates);
      this.emitArenaTick();
      this.callbacks().onArenaComplete?.(summary);
      this.emitAction(outcome === "victory" ? "arena_victory" : "arena_failed");
    }

    private emitArenaTick() {
      this.callbacks().onArenaTick?.({ ...this.arenaSnapshot });
    }

    private trackArenaState(state: PetState) {
      if (!this.animationStates.includes(state)) {
        this.animationStates.push(state);
      }
    }

    private clearArenaActors() {
      this.enemyRoots.forEach((enemy) => enemy.root.destroy(true));
      this.snackRoots.forEach((snack) => snack.root.destroy(true));
      this.enemyRoots = [];
      this.snackRoots = [];
    }

    private spawnEnemyWave(count: number) {
      const safeCount = Math.max(1, Math.min(4, count));
      for (let i = 0; i < safeCount; i += 1) {
        this.spawnEnemyAtEdge(this.enemyRoots.length + i);
      }
    }

    private spawnSnackWave(count: number) {
      for (let i = 0; i < count; i += 1) {
        this.spawnSnackAt(
          PhaserLib.Math.Between(Math.round(this.scale.width * 0.18), Math.round(this.scale.width * 0.82)),
          PhaserLib.Math.Between(Math.round(this.scale.height * 0.28), Math.round(this.scale.height * 0.74))
        );
      }
    }

    private spawnEnemyAtEdge(index: number) {
      const side = PhaserLib.Math.Between(0, 3);
      const x =
        side === 0
          ? this.scale.width * 0.1
          : side === 1
            ? this.scale.width * 0.9
            : PhaserLib.Math.Between(Math.round(this.scale.width * 0.15), Math.round(this.scale.width * 0.85));
      const y =
        side === 2
          ? this.scale.height * 0.22
          : side === 3
            ? this.scale.height * 0.78
            : PhaserLib.Math.Between(Math.round(this.scale.height * 0.25), Math.round(this.scale.height * 0.78));
      const root = this.add.container(x, y).setDepth(18);
      const shape = this.add.graphics();
      shape.fillStyle(0x062b33, 0.96);
      shape.fillRoundedRect(-34, -24, 68, 50, 22);
      shape.fillStyle(index % 2 === 0 ? 0x4edbd2 : 0xf4c95d, 0.9);
      shape.fillCircle(-13, -4, 5);
      shape.fillCircle(13, -4, 5);
      shape.fillStyle(0x062b33, 0.94);
      shape.fillTriangle(-25, 22, -14, 38, -4, 22);
      shape.fillTriangle(4, 22, 14, 38, 25, 22);
      root.add(shape);
      root.setScale(0.88 + (index % 3) * 0.06);
      this.enemyRoots.push({
        root,
        speed: 44 + Math.min(42, index * 3),
        hitReadyAt: 0,
        alive: true
      });
    }

    private spawnSnackAt(x: number, y: number) {
      const root = this.add.container(x, y).setDepth(16);
      const snack = this.add.graphics();
      snack.fillStyle(0x2b5b2c, 1);
      snack.fillRoundedRect(-30, -10, 60, 20, 10);
      snack.fillStyle(0x9dcc58, 1);
      snack.fillEllipse(-12, -12, 22, 13);
      root.add(snack);
      root.setSize(70, 42).setInteractive({ cursor: "pointer" });
      root.on("pointerdown", () => this.collectSnack(root));
      this.snackRoots.push({ root, collected: false });
      this.tweens.add({
        targets: root,
        y: y - 7,
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    private drawStaticArena() {
      const width = this.scale.width;
      const height = this.scale.height;
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(0x083941, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0x0d736c, 1);
      g.fillRoundedRect(width * 0.055, height * 0.13, width * 0.89, height * 0.74, 58);
      g.fillStyle(0xbce7b2, 1);
      g.fillRoundedRect(width * 0.1, height * 0.18, width * 0.8, height * 0.62, 42);
      g.lineStyle(8, 0x0f8475, 0.42);
      g.strokeRoundedRect(width * 0.115, height * 0.2, width * 0.77, height * 0.58, 34);
      g.lineStyle(2, 0x062b33, 0.12);
      for (let lane = 0; lane < 5; lane += 1) {
        const y = height * (0.28 + lane * 0.1);
        g.lineBetween(width * 0.14, y, width * 0.86, y + Math.sin(lane) * 10);
      }

      for (let i = 0; i < 160; i += 1) {
        const x = width * 0.12 + ((i * 83) % Math.round(width * 0.76));
        const y = height * 0.21 + ((i * 47) % Math.round(height * 0.56));
        const grass = this.add.graphics().setDepth(1);
        grass.lineStyle(4, i % 3 === 0 ? 0x42c68f : 0x169c86, 0.46);
        grass.lineBetween(x, y, x, y + 13);
        grass.lineBetween(x + 10, y + 2, x + 10, y + 12);
      }

      this.add
        .text(width * 0.5, height * 0.17, "CUDDLE ARENA", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(22, Math.round(width * 0.018))}px`,
          fontStyle: "900",
          color: "#f8fff1",
          stroke: "#062b33",
          strokeThickness: 6
        })
        .setOrigin(0.5)
        .setDepth(5);

      this.add
        .text(width * 0.79, height * 0.18, "60s  ◆  Proof Run", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(13, Math.round(width * 0.009))}px`,
          fontStyle: "900",
          color: "#f4c95d",
          stroke: "#062b33",
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(5);

      const home = this.add.graphics().setDepth(6);
      home.fillStyle(0xffd36d, 1);
      const homeX = width * 0.5;
      const homeY = height * 0.835;
      home.fillTriangle(homeX - 56, homeY, homeX, homeY - 62, homeX + 56, homeY);
      home.fillRect(homeX - 40, homeY - 2, 80, 58);
      home.fillStyle(0x062b33, 1);
      home.fillRoundedRect(homeX - 12, homeY + 22, 24, 34, 6);
      this.add.zone(homeX, homeY + 2, 128, 110).setInteractive({ cursor: "pointer" }).on("pointerdown", () => {
        this.emitAction("arena_home_to_village");
        this.game.events.emit(COMMAND_EVENT, { type: "setScene", scene: "village" } satisfies GameCommand);
      });
    }

    private drawArenaMotion(time: number) {
      if (!this.motion) {
        return;
      }

      const width = this.scale.width;
      const height = this.scale.height;
      this.motion.clear();
      this.motion.lineStyle(8, 0x0c746d, 0.45);
      for (let i = 0; i < 8; i += 1) {
        const inset = 72 + i * 22 + Math.sin(time / 520 + i) * 5;
        this.motion.strokeRoundedRect(inset, height * 0.12 + inset * 0.18, width - inset * 2, height * 0.76 - inset * 0.36, 42);
      }

      this.motion.fillStyle(0xf8fff1, 0.5);
      for (let i = 0; i < 16; i += 1) {
        const x = width * 0.12 + ((i * 137 + time / 22) % (width * 0.76));
        const y = height * (0.24 + ((i * 23) % 48) / 100);
        this.motion.fillCircle(x, y + Math.sin(time / 360 + i) * 8, i % 2 === 0 ? 3 : 2);
      }
    }

    private createLockedCompanions() {
      [
        { x: 42, y: 45, tail: -20 },
        { x: 58, y: 45, tail: -58 },
        { x: 74, y: 45, tail: -82 }
      ].forEach((item, index) => {
        const point = this.pct(item.x, item.y);
        const root = this.add.container(point.x, point.y).setDepth(20 + index);
        const shadow = this.add.ellipse(0, 38, 92, 24, 0x062b33, 0.22);
        const body = this.add.graphics();
        body.fillStyle(0x062b33, 0.88);
        body.fillEllipse(0, 7, 84, 54);
        body.fillEllipse(-6, -25, 55, 40);
        body.fillTriangle(-31, -35, -20, -62, -5, -34);
        body.fillTriangle(14, -35, 30, -62, 37, -35);
        body.fillRoundedRect(35, -2, 43, 13, 7);
        body.setRotation(PhaserLib.Math.DegToRad(item.tail));
        const label = this.add
          .text(0, 62, "locked", {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "13px",
            color: "#f8fff1",
            stroke: "#062b33",
            strokeThickness: 4
          })
          .setOrigin(0.5);
        root.add([shadow, body, label]);
        root.setSize(112, 118).setInteractive({ cursor: "pointer" });
        root.on("pointerdown", () => {
          this.setPetState("waiting");
          this.emitAction("locked_companion_waiting");
        });
        this.tweens.add({
          targets: root,
          y: point.y - 10,
          duration: 900 + index * 130,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.lockedRoots.push(root);
      });
    }

    private createEnemies() {
      [
        { x: 8, y: 44, kind: "ghost" },
        { x: 91, y: 43, kind: "ghost" },
        { x: 7, y: 64, kind: "blaster" },
        { x: 91, y: 64, kind: "blaster" }
      ].forEach((item, index) => {
        const point = this.pct(item.x, item.y);
        const root = this.add.container(point.x, point.y).setDepth(18);
        const shape = this.add.graphics();
        shape.fillStyle(0x062b33, 0.96);
        if (item.kind === "ghost") {
          shape.fillRoundedRect(-38, -26, 76, 54, 26);
          shape.fillStyle(0x4edbd2, 0.9);
          shape.fillCircle(-15, -4, 5);
          shape.fillCircle(15, -4, 5);
        } else {
          shape.fillRoundedRect(-40, -20, 80, 40, 18);
          shape.fillRect(28, -10, 24, 20);
          shape.fillStyle(0x0b5e67, 1);
          shape.fillRoundedRect(-20, -5, 40, 10, 5);
        }
        root.add(shape);
        this.tweens.add({
          targets: root,
          y: point.y + 18,
          x: point.x + (index % 2 === 0 ? 18 : -18),
          duration: 1100 + index * 140,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.enemyRoots.push({
          root,
          speed: 36 + index * 8,
          hitReadyAt: 0,
          alive: true
        });
      });
    }

    private createSnacks() {
      [
        { x: 12, y: 73 },
        { x: 88, y: 72 },
        { x: 50, y: 31 }
      ].forEach((item, index) => {
        const point = this.pct(item.x, item.y);
        const root = this.add.container(point.x, point.y).setDepth(16);
        const snack = this.add.graphics();
        snack.fillStyle(0x2b5b2c, 1);
        snack.fillRoundedRect(-30, -10, 60, 20, 10);
        snack.fillStyle(0x9dcc58, 1);
        snack.fillEllipse(-12, -12, 22, 13);
        root.add(snack);
        root.setSize(70, 42).setInteractive({ cursor: "pointer" });
        root.on("pointerdown", () => {
          if (this.arenaSnapshot.phase === "running") {
            this.collectSnack(root);
          } else {
            this.createSparkle(point.x, point.y);
            this.emitAction("snack_pickup");
            this.setPetState("waving");
          }
        });
        this.snackRoots.push({ root, collected: false });
      });
    }

    private createArenaCopy() {
      const width = this.scale.width;
      const height = this.scale.height;
      const title = this.add
        .text(width * 0.25, height * 0.72, "Snack + safety", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(12, Math.round(width * 0.008))}px`,
          color: "#f8fff1",
          stroke: "#062b33",
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(8);
      const ability = this.add
        .text(width * 0.5, height * 0.72, "Cuddle burst", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(12, Math.round(width * 0.008))}px`,
          fontStyle: "900",
          color: "#ff815e",
          stroke: "#062b33",
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(8);
      const small = this.add
        .text(width * 0.75, height * 0.72, "Walrus receipt", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${Math.max(12, Math.round(width * 0.008))}px`,
          color: "#93f5c8",
          stroke: "#062b33",
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(8);
      title.setAlpha(0.62);
      ability.setAlpha(0.68);
      small.setAlpha(0.62);
    }

    private createBurst(x: number, y: number, scale = 1) {
      const ring = this.add.circle(x, y, 24, 0x93f5c8, 0).setStrokeStyle(6, 0x93f5c8, 0.92).setDepth(2000);
      this.tweens.add({
        targets: ring,
        scale: 5 * scale,
        alpha: 0,
        duration: 520,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy()
      });

      for (let i = 0; i < 28; i += 1) {
        const angle = (Math.PI * 2 * i) / 28;
        const particle = this.add
          .circle(x, y, i % 3 === 0 ? 6 : 4, i % 2 === 0 ? 0xf4c95d : 0x93f5c8, 0.92)
          .setDepth(2001);
        this.tweens.add({
          targets: particle,
          x: x + Math.cos(angle) * PhaserLib.Math.Between(110, Math.round(230 * scale)),
          y: y + Math.sin(angle) * PhaserLib.Math.Between(72, Math.round(170 * scale)),
          alpha: 0,
          scale: 0.2,
          duration: 580 + (i % 4) * 50,
          ease: "Cubic.easeOut",
          onComplete: () => particle.destroy()
        });
      }
    }

    private createHitFlash(x: number, y: number) {
      const hit = this.add.circle(x, y, 18, 0xff6b8d, 0.92).setDepth(2002);
      this.tweens.add({
        targets: hit,
        scale: 2.4,
        alpha: 0,
        duration: 280,
        ease: "Quad.easeOut",
        onComplete: () => hit.destroy()
      });
    }

    private createSparkle(x: number, y: number) {
      for (let i = 0; i < 10; i += 1) {
        const sparkle = this.add.circle(x, y, 4, 0xf4c95d, 1).setDepth(2000);
        this.tweens.add({
          targets: sparkle,
          x: x + PhaserLib.Math.Between(-55, 55),
          y: y + PhaserLib.Math.Between(-44, 24),
          alpha: 0,
          duration: 460,
          ease: "Quad.easeOut",
          onComplete: () => sparkle.destroy()
        });
      }
    }

    private petScale(base: number) {
      return Math.max(0.44, Math.min(base, this.scale.height / 1220));
    }
  }

  class VillageScene extends PetLofiBaseScene {
    private water?: Phaser.GameObjects.Graphics;
    private mapPatchLayer?: Phaser.GameObjects.Graphics;
    private zoneRoots = new Map<GameHotspotId, Phaser.GameObjects.Container>();
    private friendRoots = new Map<string, Phaser.GameObjects.Container>();
    private activeZone: GameHotspotId = "suins-gate";
    private mapFriends: GameFriend[] = [];
    private mapRevision = 1;
    private lastNearestZoneCheckAt = 0;

    constructor() {
      super(villageKey);
    }

    create() {
      this.zoneRoots.clear();
      this.friendRoots.clear();
      this.createPetAnimations();
      this.installCommandBridge();
      this.cameras.main.setBounds(0, 0, VILLAGE_WORLD.width, VILLAGE_WORLD.height);
      this.drawVillageBase();
      this.mapPatchLayer = this.add.graphics().setDepth(1);
      this.water = this.add.graphics().setDepth(2);
      this.createVillageProps();
      this.createBuildings();
      const start = this.zoneStandPoint("feed-stall");
      this.createPet(start.x, start.y, this.petScale(0.68));
      this.setPetState("idle", false);
      if (this.petRoot) {
        this.cameras.main.startFollow(this.petRoot, true, 0.08, 0.08);
      }
      this.syncMapState(this.mapFriends, this.mapRevision);
      this.callbacks().onZoneChange?.("feed-stall");
      this.input.keyboard?.on("keydown-E", () => {
        this.emitAction(`interact_${this.activeZone}`);
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
        if (targets.length > 0 || !this.petRoot) {
          return;
        }

        const next = this.boundedPoint(pointer.worldX, pointer.worldY);
        const state = next.x < this.petRoot.x ? "running-left" : "running-right";
        this.movePetTo(next.x, next.y, state, 620);
        const nearest = this.nearestZone(next.x, next.y);
        this.setActiveZone(nearest.id, "map_click_walk");
      });
      this.scale.once("resize", () => this.scene.restart());
    }

    update(time: number, delta: number) {
      this.updateContinuousMovement(time, delta, "village_walk");
      this.drawWater(time);
      this.zoneRoots.forEach((root) => {
        root.setDepth(Math.round(root.y));
      });
      this.friendRoots.forEach((root) => {
        root.setDepth(Math.round(root.y + 24));
      });
      this.syncPetDepth();
      this.syncNearestZoneWhileMoving(time);
    }

    protected override boundedPoint(x: number, y: number) {
      return {
        x: PhaserLib.Math.Clamp(x, 90, VILLAGE_WORLD.width - 90),
        y: PhaserLib.Math.Clamp(y, 150, VILLAGE_WORLD.height - 90)
      };
    }

    protected override nudgePet(dx: number, dy: number) {
      if (!this.petRoot) {
        return;
      }

      const next = this.boundedPoint(this.petRoot.x + dx * 10, this.petRoot.y + dy * 7);
      const state = dx < 0 ? "running-left" : dx > 0 ? "running-right" : "running";
      this.movePetTo(next.x, next.y, state, 260);
      const nearest = this.nearestZone(next.x, next.y);
      this.setActiveZone(nearest.id, "village_walk");
    }

    protected override continuousMoveSpeed() {
      return { x: 620, y: 470 };
    }

    protected override goToZone(zoneId: GameHotspotId) {
      const zone = VILLAGE_HOTSPOTS.find((item) => item.id === zoneId);
      if (!zone || !this.petRoot) {
        return;
      }

      const stand = this.zoneStandPoint(zoneId);
      const state = stand.x < this.petRoot.x ? "running-left" : "running-right";
      this.movePetTo(stand.x, stand.y, state, 620);
      this.setActiveZone(zoneId, `walk_to_${zoneId}`);
      this.createWaypointPing(stand.x, stand.y);
    }

    protected override onPetPressed() {
      this.emitAction(`pet_pressed_${this.activeZone}`);
      this.setPetState("waving");
      this.time.delayedCall(500, () => this.setPetState("idle"));
    }

    private drawVillageBase() {
      const width = VILLAGE_WORLD.width;
      const height = VILLAGE_WORLD.height;
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(0x1fa76a, 1);
      g.fillRect(0, 0, width, height);

      g.lineStyle(1, 0xbef0a5, 0.08);
      for (let x = 0; x < width; x += VILLAGE_WORLD.tile) {
        g.lineBetween(x, 0, x, height);
      }
      for (let y = 0; y < height; y += VILLAGE_WORLD.tile) {
        g.lineBetween(0, y, width, y);
      }

      for (let i = 0; i < 760; i += 1) {
        const x = (i * 73) % width;
        const y = (i * 151) % height;
        const tint = i % 4 === 0 ? 0xbef0a5 : i % 4 === 1 ? 0x4edbd2 : 0x2bbd77;
        g.fillStyle(tint, 0.45);
        if (i % 5 === 0) {
          g.fillCircle(x, y, 3);
        } else {
          g.fillRect(x, y, 3, 10);
          g.fillRect(x + 7, y + 3, 3, 8);
        }
      }

      this.drawPaths(g);
    }

    private drawPaths(g: Phaser.GameObjects.Graphics) {
      const width = VILLAGE_WORLD.width;
      const height = VILLAGE_WORLD.height;
      const pathColor = 0xe9d3a0;
      const edgeColor = 0xd3b978;
      const center = this.worldPoint(52, 56);

      g.lineStyle(120, edgeColor, 0.45);
      g.beginPath();
      g.moveTo(-40, height * 0.73);
      g.lineTo(center.x - 140, center.y + 130);
      g.lineTo(center.x + 250, center.y + 80);
      g.lineTo(width + 60, height * 0.54);
      g.strokePath();

      g.beginPath();
      g.moveTo(center.x, -80);
      g.lineTo(center.x - 40, center.y - 50);
      g.lineTo(center.x - 20, height + 120);
      g.strokePath();

      g.lineStyle(100, pathColor, 1);
      g.beginPath();
      g.moveTo(-40, height * 0.73);
      g.lineTo(center.x - 140, center.y + 130);
      g.lineTo(center.x + 250, center.y + 80);
      g.lineTo(width + 60, height * 0.54);
      g.strokePath();

      g.beginPath();
      g.moveTo(center.x, -80);
      g.lineTo(center.x - 40, center.y - 50);
      g.lineTo(center.x - 20, height + 120);
      g.strokePath();

      g.fillStyle(edgeColor, 0.4);
      g.fillEllipse(center.x, center.y, 510, 330);
      g.fillStyle(pathColor, 0.98);
      g.fillEllipse(center.x, center.y, 460, 286);

      for (let i = 0; i < 80; i += 1) {
        const x = center.x - 220 + ((i * 49) % 450);
        const y = center.y - 130 + ((i * 31) % 260);
        g.fillStyle(0xcaa96b, 0.17);
        g.fillCircle(x, y, 6 + (i % 4));
      }
    }

    private drawWater(time: number) {
      if (!this.water) {
        return;
      }

      const width = VILLAGE_WORLD.width;
      const height = VILLAGE_WORLD.height;
      this.water.clear();
      this.water.fillStyle(0x62b9ff, 0.95);
      this.water.beginPath();
      this.water.moveTo(0, height * 0.86);
      for (let x = 0; x <= width * 0.33; x += 32) {
        const y = height * 0.86 + Math.sin(time / 410 + x / 80) * 11;
        this.water.lineTo(x, y);
      }
      this.water.lineTo(width * 0.36, height);
      this.water.lineTo(0, height);
      this.water.closePath();
      this.water.fillPath();

      this.water.lineStyle(12, 0xd6c68c, 0.7);
      this.water.beginPath();
      this.water.moveTo(0, height * 0.86);
      for (let x = 0; x <= width * 0.34; x += 28) {
        this.water.lineTo(x, height * 0.86 + Math.sin(time / 410 + x / 80) * 11);
      }
      this.water.strokePath();

      this.water.lineStyle(3, 0xb5eaff, 0.36);
      for (let i = 0; i < 9; i += 1) {
        const y = height * (0.91 + i * 0.015) + Math.sin(time / 520 + i) * 4;
        this.water.lineBetween(0, y, width * 0.31, y + Math.sin(time / 300 + i) * 5);
      }
    }

    private createVillageProps() {
      const props = [
        { x: 57, y: 19, type: "tree", s: 1.1 },
        { x: 79, y: 38, type: "tree", s: 1.0 },
        { x: 29, y: 52, type: "tree", s: 0.72 },
        { x: 83, y: 58, type: "tree", s: 0.72 },
        { x: 43, y: 19, type: "log", s: 0.85 },
        { x: 63, y: 70, type: "crate", s: 0.82 },
        { x: 41, y: 64, type: "crate", s: 0.7 },
        { x: 23, y: 47, type: "rock", s: 0.8 },
        { x: 50, y: 78, type: "rock", s: 0.76 },
        { x: 77, y: 54, type: "crystal", s: 0.78 },
        { x: 37, y: 38, type: "crystal", s: 0.64 }
      ];

      props.forEach((prop, index) => {
        const point = this.worldPoint(prop.x, prop.y);
        const root = this.add.container(point.x, point.y).setDepth(point.y);
        const g = this.add.graphics();
        const s = prop.s;
        if (prop.type === "tree") {
          g.fillStyle(0x7c4b28, 1);
          g.fillRect(-7 * s, -8 * s, 14 * s, 54 * s);
          g.fillStyle(0x2e9d55, 1);
          g.fillCircle(-22 * s, -24 * s, 32 * s);
          g.fillCircle(15 * s, -30 * s, 34 * s);
          g.fillCircle(4 * s, -58 * s, 30 * s);
          g.fillStyle(0x47bd67, 0.85);
          g.fillCircle(-2 * s, -40 * s, 22 * s);
        } else if (prop.type === "log") {
          g.fillStyle(0x8b552e, 1);
          g.fillRoundedRect(-28 * s, -12 * s, 56 * s, 24 * s, 12 * s);
          g.lineStyle(4 * s, 0x4a2e20, 0.85);
          g.strokeCircle(-24 * s, 0, 10 * s);
        } else if (prop.type === "crate") {
          g.fillStyle(0xba7a3c, 1);
          g.fillRect(-17 * s, -17 * s, 34 * s, 34 * s);
          g.lineStyle(4 * s, 0x4a2e20, 1);
          g.strokeRect(-17 * s, -17 * s, 34 * s, 34 * s);
          g.lineBetween(-17 * s, -17 * s, 17 * s, 17 * s);
          g.lineBetween(17 * s, -17 * s, -17 * s, 17 * s);
        } else if (prop.type === "crystal") {
          g.fillStyle(0x4edbd2, 0.95);
          g.fillTriangle(0, -28 * s, 14 * s, 0, 0, 30 * s);
          g.fillStyle(0xb7fff1, 0.8);
          g.fillTriangle(0, -28 * s, -14 * s, 0, 0, 30 * s);
        } else {
          g.fillStyle(0xc9d3ca, 1);
          g.fillEllipse(0, 0, 58 * s, 27 * s);
          g.fillStyle(0xe7eee6, 0.8);
          g.fillEllipse(-9 * s, -5 * s, 24 * s, 10 * s);
        }
        root.add(g);
        this.tweens.add({
          targets: root,
          y: point.y + (index % 2 === 0 ? -4 : 4),
          duration: 1600 + index * 30,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      });
    }

    private createBuildings() {
      VILLAGE_HOTSPOTS.forEach((zone) => {
        const point = this.worldPoint(zone.x, zone.y);
        const root = this.add.container(point.x, point.y).setDepth(point.y);
        root.add(this.drawBuilding(zone.kind));
        const label = this.add
          .text(0, 55, zone.title, {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "15px",
            color: "#f8fff1",
            stroke: "#031017",
            strokeThickness: 5
          })
          .setOrigin(0.5);
        root.add(label);
        root.setSize(190, 170);
        root.setInteractive(
          new PhaserLib.Geom.Rectangle(-95, -105, 190, 190),
          PhaserLib.Geom.Rectangle.Contains
        );
        root.on("pointerdown", () => this.goToZone(zone.id));
        this.zoneRoots.set(zone.id, root);
        this.tweens.add({
          targets: root,
          y: point.y - 5,
          duration: 1250 + zone.x * 10,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      });
    }

    private drawBuilding(kind: (typeof VILLAGE_HOTSPOTS)[number]["kind"]) {
      const root = this.add.container(0, 0);
      const shadow = this.add.ellipse(0, 42, 170, 48, 0x062b33, 0.18);
      const g = this.add.graphics();
      const roof = kind === "vault" ? 0xa99cff : kind === "forge" ? 0xf4c95d : 0x4aa9ff;
      const wall = kind === "library" ? 0xe9f5e6 : 0xfff3cf;
      g.fillStyle(0xe6f5e8, 0.24);
      g.fillEllipse(0, 26, 180, 88);
      g.fillStyle(wall, 1);
      g.fillRect(-54, -22, 108, 72);
      g.lineStyle(4, 0x31504b, 0.95);
      g.strokeRect(-54, -22, 108, 72);
      g.fillStyle(roof, 1);
      g.fillTriangle(-72, -22, 0, -76, 72, -22);
      g.fillRect(-58, -39, 116, 22);
      g.lineStyle(4, 0x1d383d, 1);
      g.strokeTriangle(-72, -22, 0, -76, 72, -22);
      g.strokeRect(-58, -39, 116, 22);
      g.fillStyle(0x684129, 1);
      g.fillRoundedRect(-16, 15, 32, 35, 12);
      g.fillStyle(0xfff2a6, 1);
      g.fillRect(-40, -7, 19, 21);
      g.fillRect(22, -7, 19, 21);
      g.lineStyle(2, 0x31504b, 1);
      g.strokeRect(-40, -7, 19, 21);
      g.strokeRect(22, -7, 19, 21);

      const sign = this.add
        .text(0, -3, this.signForKind(kind), {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "16px",
          fontStyle: "900",
          color: "#17302d",
          backgroundColor: "#e7f5dd",
          padding: { x: 7, y: 3 }
        })
        .setOrigin(0.5);
      root.add([shadow, g, sign]);
      return root;
    }

    private signForKind(kind: (typeof VILLAGE_HOTSPOTS)[number]["kind"]) {
      if (kind === "forge") {
        return "Work";
      }
      if (kind === "vault") {
        return "Proof";
      }
      if (kind === "library") {
        return "Memo";
      }
      if (kind === "rest") {
        return "Rest";
      }
      if (kind === "feed") {
        return "Feed";
      }
      if (kind === "gallery") {
        return "Dex";
      }
      return "Name";
    }

    private setActiveZone(zoneId: GameHotspotId, action: string) {
      this.activeZone = zoneId;
      this.callbacks().onZoneChange?.(zoneId);
      this.emitAction(action);
      this.zoneRoots.forEach((root, id) => {
        root.setScale(id === zoneId ? 1.05 : 1);
      });
    }

    private syncNearestZoneWhileMoving(time: number) {
      if (!this.petRoot || !this.continuousMoveActive || time - this.lastNearestZoneCheckAt < 260) {
        return;
      }

      this.lastNearestZoneCheckAt = time;
      const nearest = this.nearestZone(this.petRoot.x, this.petRoot.y);
      if (nearest.id !== this.activeZone) {
        this.setActiveZone(nearest.id, "village_walk");
      }
    }

    private nearestZone(x: number, y: number) {
      return VILLAGE_HOTSPOTS.reduce((closest, zone) => {
        const point = this.zoneStandPoint(zone.id);
        const currentDistance = Math.abs(point.x - x) + Math.abs(point.y - y);
        const closestPoint = this.zoneStandPoint(closest.id);
        const closestDistance = Math.abs(closestPoint.x - x) + Math.abs(closestPoint.y - y);
        return currentDistance < closestDistance ? zone : closest;
      }, VILLAGE_HOTSPOTS[0]);
    }

    private zoneStandPoint(zoneId: GameHotspotId) {
      const zone = VILLAGE_HOTSPOTS.find((item) => item.id === zoneId) ?? VILLAGE_HOTSPOTS[0];
      return this.worldPoint(zone.standX, zone.standY);
    }

    private worldPoint(x: number, y: number) {
      return {
        x: (VILLAGE_WORLD.width * x) / 100,
        y: (VILLAGE_WORLD.height * y) / 100
      };
    }

    private createWaypointPing(x: number, y: number) {
      const ring = this.add.circle(x, y + 5, 20, 0x93f5c8, 0).setStrokeStyle(5, 0x93f5c8, 0.85).setDepth(1800);
      this.tweens.add({
        targets: ring,
        scale: 2.4,
        alpha: 0,
        duration: 560,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy()
      });
    }

    protected override syncMapState(friends: GameFriend[], mapRevision: number) {
      this.mapFriends = friends;
      this.mapRevision = mapRevision;
      if (!this.scene.isActive(this.scene.key)) {
        return;
      }

      this.drawMapPatches();
      this.renderFriendActors();
    }

    private drawMapPatches() {
      if (!this.mapPatchLayer) {
        return;
      }

      this.mapPatchLayer.clear();
      this.mapPatchLayer.fillStyle(0x082c32, 0.28);
      this.mapPatchLayer.fillRoundedRect(24, 24, 360, 76, 8);
      this.mapPatchLayer.lineStyle(2, 0x93f5c8, 0.45);
      this.mapPatchLayer.strokeRoundedRect(24, 24, 360, 76, 8);

      this.mapPatchLayer.fillStyle(0x93f5c8, 0.92);
      for (let i = 0; i < this.mapRevision; i += 1) {
        this.mapPatchLayer.fillRect(46 + i * 18, 74, 10, 10);
      }

      this.mapFriends.forEach((friend, index) => {
        const point = this.friendPoint(friend, index);
        const tileX = Math.floor(point.x / VILLAGE_WORLD.tile) * VILLAGE_WORLD.tile;
        const tileY = Math.floor(point.y / VILLAGE_WORLD.tile) * VILLAGE_WORLD.tile;
        const color = parseColor(friend.color);
        this.mapPatchLayer?.fillStyle(color, 0.28);
        this.mapPatchLayer?.fillRoundedRect(tileX - 48, tileY - 48, VILLAGE_WORLD.tile * 3, VILLAGE_WORLD.tile * 3, 10);
        this.mapPatchLayer?.lineStyle(3, color, 0.68);
        this.mapPatchLayer?.strokeRoundedRect(tileX - 48, tileY - 48, VILLAGE_WORLD.tile * 3, VILLAGE_WORLD.tile * 3, 10);
      });

      const label = this.add
        .text(44, 36, `MAP PIXEL CONTRACT  r${this.mapRevision}`, {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "18px",
          fontStyle: "900",
          color: "#f8fff1",
          stroke: "#031017",
          strokeThickness: 4
        })
        .setDepth(3)
        .setScrollFactor(1);
      this.time.delayedCall(80, () => label.destroy());
    }

    private renderFriendActors() {
      this.friendRoots.forEach((root) => root.destroy(true));
      this.friendRoots.clear();

      this.mapFriends.forEach((friend, index) => {
        const point = this.friendPoint(friend, index);
        const root = this.add.container(point.x, point.y).setDepth(point.y + 24);
        const color = parseColor(friend.color);
        const plot = this.add.graphics();
        plot.fillStyle(color, 0.25);
        plot.fillEllipse(0, 30, 142, 56);
        plot.lineStyle(3, color, 0.65);
        plot.strokeEllipse(0, 30, 142, 56);
        const shadow = this.add.ellipse(0, 25, 72, 20, 0x062b33, 0.2);
        const sprite = this.add.sprite(0, 0, PET_TEXTURE).setOrigin(0.5, 0.82).setScale(0.36).setTint(color);
        sprite.play(this.animationKey(friend.petState ?? (index % 2 === 0 ? "waving" : "review")), true);
        const label = this.add
          .text(0, -70, friend.name, {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "15px",
            color: "#f8fff1",
            backgroundColor: "#082c32",
            padding: { x: 8, y: 4 },
            stroke: "#031017",
            strokeThickness: 4
          })
          .setOrigin(0.5);
        const role = this.add
          .text(0, 70, friend.role, {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "13px",
            color: "#f4c95d",
            stroke: "#031017",
            strokeThickness: 4
          })
          .setOrigin(0.5);
        root.add([plot, shadow, sprite, label, role]);
        root.setSize(150, 170);
        root.setInteractive(
          new PhaserLib.Geom.Rectangle(-75, -95, 150, 180),
          PhaserLib.Geom.Rectangle.Contains
        );
        root.on("pointerdown", () => {
          this.setActiveZone(friend.zoneId, `visit_friend_${friend.id}`);
          this.createWaypointPing(point.x, point.y);
        });
        this.tweens.add({
          targets: root,
          y: point.y - 8,
          duration: 1100 + index * 90,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.friendRoots.set(friend.id, root);
      });
    }

    private friendPoint(friend: GameFriend, index: number) {
      if (typeof friend.x === "number" && typeof friend.y === "number") {
        return { x: friend.x, y: friend.y };
      }

      const zone = this.zoneStandPoint(friend.zoneId);
      const radius = 170 + (index % 3) * 54;
      const angle = -1.1 + index * 0.92;
      return {
        x: PhaserLib.Math.Clamp(zone.x + Math.cos(angle) * radius, 120, VILLAGE_WORLD.width - 120),
        y: PhaserLib.Math.Clamp(zone.y + Math.sin(angle) * radius, 170, VILLAGE_WORLD.height - 120)
      };
    }

    private petScale(base: number) {
      return Math.max(0.44, Math.min(base, this.scale.height / 1180));
    }
  }

  return {
    ArenaScene,
    VillageScene,
    commandEvent: COMMAND_EVENT,
    callbacksKey: CALLBACKS_KEY
  };
}

function parseColor(color: string) {
  const normalized = color.replace("#", "").trim();
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : 0x93f5c8;
}
