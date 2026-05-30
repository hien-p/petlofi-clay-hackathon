# Brainstorm — FE vs Design vs Onboarding (next 1–2 weeks)

Date: 2026-05-30 · Project: PetLofi (Sui CLAY hackathon) · Live: https://petlofi.petlofi.workers.dev

## Context (locked)
- Audience this week: **hackathon judges** (short demo glances, scored).
- Deadline: **1–2 weeks**.
- Owner's gut on weakest point: **"khó hiểu phải làm gì"** (users don't know what to do / where to start).

## Problem statement
App drops a first-timer directly into the "Cuddle Arena" with no framing. The strongest work
(on-chain mint, AI agent proof, Walrus blob, SuiNS) is **invisible**. To reach the "wow"
(real mint) a judge must install a wallet + fund testnet gas → they bail. So judges see a
pixel yeti and miss the entire stack. Bottleneck = **comprehension + access**, NOT FE code or visual polish.

## Approaches evaluated
| Option | Pros | Cons | Verdict for judges |
|--------|------|------|--------------------|
| FE foundation/refactor | cleaner code, easier future | **invisible to judges**, 0 demo points | ❌ YAGNI now |
| Design / landing polish | "premium" feel, good for share/pitch | judges land in arena not landing; pretty ≠ understandable | 🟡 secondary |
| **Onboarding + guided demo** | hits the actual failure (confusion + access), surfaces the tech story | needs careful "demo vs live" labeling | ✅ **primary** |

## The real lens: "Judge 60-second journey"
Current: open link → see yeti in arena → don't know it's on-chain → can't find Sui/Walrus/agent story → must install wallet + faucet gas → quit.
Target: open link → understand "on-chain pet on Sui" in <10s → watch full flow (live pet → agent proof → on-chain receipt) in <60s **without a wallet** → optional "Try on-chain" for those who connect.

## Two knots to cut (in order)
1. **No guide** (matches owner gut): missing one-line "what is this", a "start here" CTA, 3–4 step coachmarks, and prominent **"what just happened" on-chain receipts**.
2. **Wallet/gas friction = silent killer.** Even great copy won't make a judge install a wallet in 60s. Sub-decision:
   - ✅ **Guided Demo mode (no wallet)** — auto-plays the wow moments, clearly labeled "demo". Fast, zero friction. Do first.
   - 🟡 **zkLogin** (Google login → Sui address, no extension) — very on-brand for Sui, still real on-chain, but integration is a time sink. Stretch only after P0+P1.
   - 🟡 **Sponsored gas / 1-click faucet** for a freshly created wallet — removes gas worry but needs relayer. Later.

## Recommended scope (prioritized, KISS/YAGNI)
**P0 — make judges see & understand (3–4 days)**
1. First-run overlay: 3-step coachmark ("on-chain pet on Sui → run agent for proof → mint when ready") + Skip.
2. "Watch demo" (no wallet): auto-walk yeti through zones, auto-run one agent task, show proof — a ~20–30s trailer.
3. Prominent "What just happened" receipts with **clickable explorer links**: `minted on Sui testnet [tx]`, `Walrus blob [link]`, `agent proof`. (Proof feed exists — make it loud + linked.)

**P1 — lower friction (2–3 days)**
4. Clear "Try on-chain" CTA; if no wallet → one-step guidance + in-app testnet faucet link.
5. Disconnected/empty state explicitly says "viewing demo — connect to play for real".

**P2 — if time remains**
6. One-screen hero/landing for shared links/pitch (must NOT block entry to the game).
7. zkLogin (stretch).

**Explicitly NOT now (YAGNI):** FE refactor, design system, deep mobile polish, new gameplay.

## Risks
- **Unlabeled demo = ethics + scoring risk.** Must clearly mark "Demo (no wallet)" vs "Live on-chain". Never let mock read as real.
- **zkLogin is a time pit** — don't start until P0+P1 done.
- Don't build a tutorial engine; 3 coachmarks + 1 auto-demo is enough.

## Success metrics
- Judge understands "what this is" in **<10s**.
- Full flow (live pet → agent proof → on-chain receipt) seen in **<60s without a wallet**.
- Every on-chain action has a **clickable explorer link** proving it's real.

## Next steps / dependencies
1. Build P0.2 auto-demo on the existing scene command bus (sendGameCommand) — reuse, don't rebuild.
2. Wire explorer links: testnet `suiscan`/`suivision` URL from tx digest already returned by `signAndExecute`.
3. Keep current "Panels" hidden-by-default; add the coachmark to point at the key controls.
4. Decide zkLogin go/no-go only after P0+P1 land.
