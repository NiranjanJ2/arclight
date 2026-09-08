# ArcLight visual implementation inventory

## Accepted concepts

- Desktop source: `arclight-desktop-concept.png` at 1536×1024.
- Mobile source: `arclight-mobile-concept.png` at 852×1845.

## Color lock

- Ink background: `#0b0c0f` (true cool near-black, never warmed).
- Graphite surface: `#14161b`.
- Raised graphite: `#1b1e24`.
- Paper text: `#e8e6df`.
- Muted text: `#8d919b`.
- Periwinkle action: `#9aa7ff`.
- Amber selection: `#e4b86a`.
- Structural rule: `rgba(232, 230, 223, 0.13)`.

No gradients, glows, warm cream surfaces, decorative shadows, or color overlays.

## Typography

- Paper title/body: `Source Serif 4`, `Iowan Old Style`, `Palatino Linotype`, Georgia, serif.
- Application chrome: Inter, `SF Pro Text`, `Segoe UI`, sans-serif.
- Article body: 18px/1.65 desktop, 17px/1.65 compact desktop, 18px/1.7 mobile; maximum 70 characters.
- Title: clamp 34–48px, 1.08, weight 500.
- Section headings: 30px/1.2 and 23px/1.3, weight 500.
- Utility controls: 13px/1.2, weight 500; never inherit article typography.

## Layout and container model

```text
desktop
┌──────────────────────────────── top utility bar ────────────────────────────┐
│ mark │ back/forward │ arXiv import                         │ view controls │
├──────────────┬──────────────────────────────────────┬────────────────────────┤
│ metadata     │                                      │ Highlights Notes Arc   │
│ progress     │       68–72ch paper column           │ saved quotes / notes   │
│ filament     │                                      │                        │
│ outline      │       selection action bar           │                        │
│              │       acronym popover                │ chat composer          │
└──────────────┴──────────────────────────────────────┴────────────────────────┘

mobile
┌──────────────── compact bar + progress ───────────────┐
│ paper title + authors                                 │
│ single article column                                 │
│ selection action bar                                 │
│ article continues                                    │
├──────────────── bottom workspace sheet ───────────────┤
│ tabs / selected context / reply / composer            │
└───────────────────────────────────────────────────────┘
```

- Desktop rails are structural columns, not rounded dashboard cards.
- The article column is open and centered with generous vertical rhythm.
- The right workspace is a fixed-width rail with hairline separators.
- On mobile, rails become modal sheets; the article remains one column.

## Allowed first-viewport copy

- `ArcLight`
- `Paste an arXiv link or ID`
- loaded paper title, authors, identifier, progress, and section names
- `Highlights`, `Notes`, `Ask Arc`
- `Highlight`, `Summarize`, `Bullets`
- `Defined in this paper`
- `Ask a question about this paper…`

Loading, empty, and error states may add concise task-specific copy required for operation.

## Component family

- Buttons: hairline outline or open icon button, 6px radius, 36–40px desktop height, 44px touch height.
- Import control: single low-contrast outlined field, action icon at the end.
- Tabs: open horizontal labels with a 2px periwinkle selected rule.
- Highlight rows: open list rows with a 3px amber quote rule; no outer card.
- Generated note: open list row with a periwinkle rule; pending/error are state variants.
- Selection bar: the one elevated dark floating surface, divided into action segments.
- Acronym popover: compact graphite panel with pointer, 6px radius, 1px rule.
- Mobile workspace: bottom sheet with 22px top corners and one drag handle.

## Icon inventory

Use Lucide outline icons at 17–19px and stroke width 1.6: ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Download, MoreHorizontal, Search, SlidersHorizontal, PanelLeft, PanelRight, Sun, Settings, BookOpen, Info, Highlighter, AlignLeft, List, CircleHelp, Copy, Trash2, Send, X, Minus, Plus. Icons use currentColor and inherit active/disabled state.

## Motion

- 140ms color/border feedback for controls.
- 220ms drawer/panel transform for user-triggered state changes.
- No ambient animation or section reveal sequence.
- Disable smooth scrolling and transitions under `prefers-reduced-motion`.

