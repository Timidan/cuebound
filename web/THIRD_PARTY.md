# Third-party material in `web/`

Source code copied into this folder keeps its original licence. Everything listed is compatible with the repository's MIT licence.

## SmoothUI components (copied source)

MIT License, Copyright (c) 2024 Eduardo Calvo. Source: https://github.com/educlopez/smoothui (installed through the shadcn registry `@smoothui`, https://smoothui.dev).
Files live in `src/components/smoothui/<name>/index.tsx`. Some were edited for CueBound; the edits are noted.

| Component | Used for | Edited |
| --- | --- | --- |
| `dot-morph-button` | Primary actions (Generate, Make 3 more, Next) | Added `busy`, `disabled`, `tone` and `type`; tabular label |
| `smooth-button` | Base of `dot-morph-button` | Tap scale 0.96; `scale` added to the transition list |
| `animated-stepper` | The 4-step bar | Palette, tab stop when no step is active, no empty panel, tap scale |
| `animated-file-upload` | Clip upload | Copy, `hint` prop, smaller padding, error copy, aria-label, tap scale |
| `dynamic-island` | Live Livepeer render status | Trimmed to a controlled island without the demo views |
| `ai-tool-call` | One row per Livepeer call | Palette ring colours, tabular summary, 11px labels |
| `price-flow` | Spend in the header | No |
| `drawer` | Take drawer and Livepeer activity panel | `modal` pass-through, padding |
| `notification-badge` | New-take count on pads | Visibility derived from props, no animation on load |
| `scrubber` | Loudness | Real minus sign, project mono font |
| `ai-approval` | Approving the sound brief | Tap scale, icon weight |
| `file-tree` | Godot pack contents | No |
| `button-copy` | Copy the brief reference, pack path and hookup code | `label` prop, shorter delay, press feedback, "Copying…" |
| `basic-toast` | Messages and errors | Palette, bottom-right, `role`, "Dismiss message" label |
| `animated-toggle` | "Plays often" and "Play in the clip replay" | No |
| `magnetic-button` | Landing call to action (wraps the shimmer button) | No |
| `shimmer-sweep` | Landing hero kicker | No |
| `reveal-text` | Landing section titles | No |
| `wave-text` | "Ready to hear your game?" | Letters grouped by word so lines break between words; one accessible label |
| `typewriter-text` | Landing prompt explorer and `Sfx.play("jump")` | Timer type made DOM-friendly |
| `tilt-card` | The sound-brief scroll on the landing | No |
| `border-beam` | The live Livepeer model card | No |
| `glow-hover-card` | The three sound-brief facts | No |
| `animated-tabs` | Style switch in the prompt explorer | No-wrap labels, press state, concentric radius |
| `infinite-slider` | The ribbon of example events | No |
| `scroll-reveal-paragraph` | The sound-brief explanation | Reduced-motion layout fix; ghost copy `aria-hidden` |
| `gravity-stars` | The night sky of the final call to action | No |
| `pixel-flow-field` | The rippling CUEBOUND wordmark behind the hero headline (copied from Tern's vendored copy) | No |

## Magic UI components (copied source)

MIT License, Copyright (c) Magic UI. Source: https://github.com/magicuidesign/magicui. Copied from Tern's vendored copies (see below).
`src/components/magicui/`: `shimmer-button` (landing call to action; `transition-shadow`, doubled press removed), `morphing-text` (hero line; longer hold per phrase), `hyper-text` (the brief fingerprint; CueBound added `preserveCase`), `particles` (hero sparkles; timer type made DOM-friendly).

## Adapted from Tern

MIT License, Copyright (c) 2026 Timidan. Source: Tern, an earlier project by the same author (not yet published).
- `src/components/RollingNumber.tsx`: adapted from Tern's `rolling-number.tsx`.
- `src/components/landing/JumpStory.tsx`: the scroll-drawn route follows the pattern of Tern's `sequence.tsx`.
- The Magic UI files and `pixel-flow-field` above were copied from Tern's vendored copies.

## shadcn/ui components (copied source)

MIT License, Copyright (c) 2023 shadcn. Source: https://github.com/shadcn-ui/ui.
`src/components/ui/drawer.tsx` and `popover.tsx`, plus the theme utilities imported from the `shadcn` package.

## Fonts (bundled through Fontsource)

SIL Open Font License 1.1: Bricolage Grotesque, Instrument Sans, IBM Plex Mono.

## Art

`public/art/`: pixel art made for CueBound (parallax layers, icons, og image). Prompts, tools and processing are recorded in [`public/art/PROVENANCE.md`](public/art/PROVENANCE.md). The hero sprite in `src/components/landing/Sprite.tsx` and the five pad glyphs in `src/components/PixelIcon.tsx` (arrow up, arrow down, heart, cursor, plus) are original pixel art drawn in code for CueBound.

## Livepeer brand assets

`public/brand/livepeer-*.svg`: Livepeer brand assets, from https://livepeer.org/brand, used per their guidelines (unmodified; white on dark and black on light; no rotation, stretching, recolouring or effects; clear space equal to the symbol width; minimum 16 px symbol and 24 px lockup). See `public/brand/SOURCE.md`.

## npm dependencies

All permissive: MIT (react, react-dom, motion, radix-ui, @radix-ui/react-slot, vaul, cn, react-use-measure, tailwindcss, @tailwindcss/vite, tw-animate-css, shadcn, vite, @vitejs/plugin-react, oxlint), Apache-2.0 (class-variance-authority, typescript).

## Icons

[Phosphor Icons](https://phosphoricons.com) (`@phosphor-icons/react`), MIT License, Copyright (c) 2023 Phosphor Icons. Used for interface glyphs (play, check, copy, file tree, toast states). The pixel-art icon set in `public/art/` is CueBound's own.
