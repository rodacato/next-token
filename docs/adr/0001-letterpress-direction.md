# 1. Letterpress bench with a typographic fan

Date: 2026-10-16 · Status: accepted

## Context

Step 0 compared three directions for the same moment (`design/step-0/`):
A, a workbench seen from above; B, a specimen sheet with the fan set in
Bodoni; C, a locked forme on the press bed, on a dark ground.

## Decision

A's bench is the layout system: the type case, composing stick, press and
proof are separate props that each chapter rearranges. The probability fan
uses B's form: candidates are set in Bodoni Moda at a size proportional to
√p, sweeping from the stick's caret, with ribs and percentages in IBM Plex
Mono. C's mirrored forme is kept for the chapter 7 press close-up.

## Consequences

- The fan is an SVG with its own viewBox. It scales on narrow screens, and
  its origin follows the stick's NEXT slot on wide ones.
- Only the five brief hues are allowed, plus tints mixed from them with
  `color-mix`. Two typefaces, self-hosted through Fontsource so GitHub Pages
  and the Dojo iframe need no font CDN.
- Motion is mechanical: sorts fall with ease-in and seat with a 6%
  compression, and the platen drops, jolts and lifts. With
  `prefers-reduced-motion`, sorts appear in place and the press inks without
  travel.
