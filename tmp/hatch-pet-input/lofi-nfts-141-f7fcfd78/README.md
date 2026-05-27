# Lofi NFTs #141 Hatch-Pet Input

This folder is the offline refinement handoff for the PetLofi top-10 Lofi pipeline.

- Pack ID: lofi-nfts-141-f7fcfd78
- Token ID: 0x98f1b5afbb89def1de77c3226c218bb330a67fc917b035f067726844c2bf250e
- Source origin: metadata-fallback
- Source image: source-fallback.png

Run the hatch-pet workflow using the source image as the character reference. When the refined atlas is ready, copy it back to:

`apps/web/public/pets/lofi-nfts-141-f7fcfd78/refined-spritesheet.webp`

Then stage the selected token with `{ refine: true }` through `POST /api/lofi/generated`. The route will replace only this pack's `spritesheet.webp` and mark `generationMode` as `hatch-refined`.
