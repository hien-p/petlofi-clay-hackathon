# 3-5 Minute Demo Script

## 0:00 - 0:30: Setup

Open the PetLofi room. Show the full-screen PetLofi Village, the pet nameplate, the animation hotbar, the D-pad, and the floating action dock. Explain the core narrative: a SuiNS name is the builder identity, and the PetLofi NFT is the companion that proves what the name has done.

## 0:30 - 1:30: Mint / Ownership

Move the pet to **SuiNS Gate** with arrow keys or by clicking the building. Connect a Sui testnet wallet, then show the resolved SuiNS name or address-mode fallback. Press **Interact** to mint, then interact again to equip the pet to SuiNS. If the package ID is configured, show the Sui `mint_pet` path. If running locally before publish, show the local proof mode banner and the minted asset blob created from `pet.json + spritesheet.webp`.

## 1:30 - 2:45: AI Agent Work

Run a task such as:

```text
Review this PetLofi demo plan and produce the next concrete shipping step.
```

Move to **Agent Forge** and press **Interact**. Call out the pet state changes: `running` while working, `review` during synthesis, and `jumping` when complete. Show the animation hotbar so the pet reads as a game object, not a loading spinner.

## 2:45 - 3:45: Memory + Walrus Proof

Move to **MemWal Library** to save the task summary, then **Walrus Vault** to sync proof. Show the recalled memory, the task digest, and the Walrus blob/proof panel.

## 3:45 - 4:30: Pet Game State

Show XP, mood, energy, streak, evolution stage, latest memory blob, Name Quests, and the local game actions. Move through **Treat Stall**, **Rest Hut**, **Walrus Vault**, and **SuiNS Gate** to trigger feed, rest, sync, and locked/unlocked evolve paths. Explain that bulky proof data lives off-chain while canonical pet state lives in Sui.

## 4:30 - 5:00: Proof Passport + Codex Pet Pack

Open **Petdex Gallery** from the village. Show the Proof Passport for the active SuiNS/address identity: active pet, object pointer, level/XP, streak, Walrus blob, and MemWal memory. Point to the Messenger Identity log, then download the pet ZIP and show that it contains `pet.json` and `spritesheet.webp`, matching the Codex pet contract.
