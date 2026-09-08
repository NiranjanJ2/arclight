# ArcLight fidelity ledger

Compared at the accepted native desktop viewport (1536 × 1024) and a compact mobile viewport (390 × 844) on 2026-09-06.

| Area | Accepted direction | Implemented result | Status |
| --- | --- | --- | --- |
| Desktop composition | Persistent outline, broad reading column, persistent workspace | 304 px outline rail, fluid paper column, 376 px workspace with the same vertical divisions | Matched |
| Palette | Near-black ink surface, warm paper text, periwinkle actions, amber reading marks | `#090a0c` base, warm off-white serif copy, periwinkle tabs/controls, amber highlight rails and marks | Matched |
| Typography | Editorial serif paper inside a quiet sans-serif shell | Self-hosted Source Serif 4 for paper content and Inter for controls/metadata | Matched |
| Density and rhythm | Hairline separators, restrained controls, long-form reading cadence | Thin rules, 18 px / 1.64 body copy, compact tool chrome, generous section spacing | Matched |
| Highlight language | Amber selection marks and quote cards tied to source sections | Restored in-article marks plus amber-railed highlight rows with section names, copy, and remove actions | Matched |
| Mobile structure | Minimal reading header with bottom-sheet tools | 390 px layout has no horizontal overflow; outline/workspace become dismissible drawers and Ask Arc becomes a full-height sheet | Matched |
| Icon family | Fine, geometric line icons | Lucide line icons at consistent 14–18 px optical weight | Matched |

## Above-the-fold copy comparison

The implementation preserves the concept's key above-the-fold labels: `ArcLight`, `Attention Is All You Need`, the author line, `Abstract`, `Highlights`, `Notes`, and `Ask Arc`. The sample abstract uses locally authored demo copy instead of reproducing the paper's full abstract, and read progress correctly begins at `0%` instead of the concept's illustrative `42%`.

## Deliberate deviations

- The concept's decorative sort, search, overflow, and settings controls were omitted until they have real behavior.
- The desktop toolbar uses text-size, theme, outline, and workspace controls because those are functional reader actions.
- The mobile proof capture shows a successful live chat state; the selection toolbar is separately covered by the interaction suite because browser automation cannot create a trustworthy native text drag selection in this environment.
