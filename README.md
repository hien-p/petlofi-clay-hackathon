# PetLofi

PetLofi is a SuiNS identity game and Sui-owned Lofi proof-of-work companion for the CLAY Hackathon. A builder connects a wallet, resolves their SuiNS name when available, mints a CLAY Lofi Yeti pet, equips it to that identity, runs AI work, and grows a proof passport backed by Walrus and MemWal.

## What Ships

- `apps/web`: full-screen PetLofi Village game UI with wallet connect, SuiNS Companion Mode, keyboard/D-pad movement, clickable buildings, CLAY Lofi Yeti mint/equip flow, name quests, proof passport, animation state hotbar, local game actions, agent console, Walrus proof HUD, messenger identity log, Petdex, and Codex pet-pack download.
- `apps/agent`: small TypeScript runtime for agent action mapping, task proofs, MemWal recall/remember, and fallback memory.
- `contracts/petlofi`: Sui Move package with `PetTemplate` and `Pet` state, full game-state actions, and tests.

## Art Guardrail

Water and shoreline visuals are procedural paths for now, not atlas tiles. The available JPEG source sheets crop with halo artifacts at the edges, so cleaned transparent PNG water-edge tiles are required before shipping real atlas-based shorelines. See `docs/art-pipeline-guardrails.md`.

## Quick Start

```bash
pnpm install
pnpm make:sample-pet
pnpm dev
```

Then open `http://localhost:3000`.

## SuiNS / Sui / Walrus / MemWal

PetLofi starts on Sui testnet. The web app resolves SuiNS names through the Sui RPC when a wallet is connected, but falls back to address/local identity mode so the game is always playable. Set `NEXT_PUBLIC_PETLOFI_PACKAGE_ID` after publishing the Move package. Walrus and MemWal use real HTTP integrations when configured; without credentials they return honest local proof objects under `.petlofi/` so the demo flow still runs end to end.

## Demo Arc

1. Move around PetLofi Village with arrow keys or the D-pad.
2. Interact with SuiNS Gate to resolve identity, mint the CLAY Lofi Yeti pet, and equip it to the active identity.
3. Visit Agent Forge, Walrus Vault, MemWal Library, Rest Hut, Treat Stall, and Petdex Gallery.
4. Run an AI task and watch the pet animate through `running`, `review`, and `jumping`.
5. Save memory, sync proof, feed/rest, move, trigger blocked/evolve states, and show Name Quests.
6. Show the Proof Passport: SuiNS/address identity, active pet, XP/streak, Walrus proof, MemWal memory blob, messenger identity log, and downloadable Codex pet pack.
