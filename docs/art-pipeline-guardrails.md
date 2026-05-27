# PetLofi Art Pipeline Guardrails

## Water And Shorelines

The current water and shoreline visuals are procedural path rendering, not atlas tiles.

Do not replace them with the JPEG source-sheet tiles yet. Those sheets crop with visible halo artifacts at tile edges, so they make the map look less like a real game once repeated.

Use real water-edge atlas tiles only after the source art is re-exported as cleaned transparent PNG assets with:

- no white/dark halo on transparent edges
- at least 1-2px bleed around every tile
- consistent tile dimensions
- verified seamless joins on straight, corner, and inner-corner shorelines

Until then, keep the procedural paths as the safe visual fallback.
