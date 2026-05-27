# Lofi NFTs #623 Hatch-Pet Input

This folder is the offline refinement handoff for the PetLofi top-10 Lofi pipeline.

- Pack ID: lofi-nfts-623-8b7581c5
- Token ID: 0x60a9ca1697f4ca0c04b54b59a6f232298c20c2b456059c406b16995d03bd6953
- Source origin: unknown
- Source image: source-fallback.png

Run the hatch-pet workflow using the source image as the character reference. When the refined atlas is ready, copy it back to:

`apps/web/public/pets/lofi-nfts-623-8b7581c5/refined-spritesheet.webp`

Then stage the selected token with `{ refine: true }` through `POST /api/lofi/generated`. The route will replace only this pack's `spritesheet.webp` and mark `generationMode` as `hatch-refined`.
