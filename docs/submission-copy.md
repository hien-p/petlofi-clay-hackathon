# CLAY Submission Copy

## Project Title

PetLofi

## Description

PetLofi is a playable SuiNS identity game and Sui-owned Lofi proof-of-work companion. Builders walk a CLAY Lofi Yeti through PetLofi Village, resolve a SuiNS name or use address mode, mint the pet, equip it as their identity companion, run AI-agent tasks at Agent Forge, save memory at MemWal Library, and sync proofs at Walrus Vault. The pet's canonical game state, including level, XP, mood, energy, streaks, evolution, and latest memory pointer, lives on Sui. Animation packs, task digests, and memory snapshots are stored as Walrus proofs, while MemWal gives each pet persistent memory across sessions. The demo shows a complete loop: move around the village, connect wallet, resolve identity, mint and equip the Lofi pet, run an AI task, complete name quests, save memory, inspect the proof passport, open Petdex, and download a Codex-compatible pet pack.

## Technical Notes

- Sui Move package: `contracts/petlofi`
- SuiNS Companion Mode: identity lookup plus address fallback
- Web app: `apps/web`
- Agent and memory runtime: `apps/agent`
- Codex pet pack format: `pet.json` plus `spritesheet.webp`
