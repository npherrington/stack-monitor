# The Stack map's canvas is React Flow, with our own file format

**Status:** Accepted — 2026-11

## Context

The Stack map (PLAN.md § Feature map) is a canvas for sketching how a feature moves through the
stack: blocks dragged in from a palette, joined by arrows, labelled, selected, deleted, panned and
zoomed, by mouse and by keyboard, in every theme variety. The page had no canvas before, and a
saved map is a JSON file in someone's repo, so whatever draws it must not decide what the file
holds.

## Decision

- **`@xyflow/react` 13.0.3**, pinned exact (no `^`) while the major is weeks old; it moves to a
  range once 13 has settled. Nodes are our own components styled with Tailwind
  (`web/components/feature-map/block-node.tsx`).
- **The file format is ours.** A map holds nodes as `{ id, block, label, note?, x, y }` and arrows
  as `{ id, from, to, label? }` (`core/feature-map/schema.ts`). `web/lib/stack-map-canvas.ts`
  converts to React Flow's nodes and edges and back, and is the only place that knows both.
- **Themed through its variables.** `web/index.css` maps React Flow's `--xy-*` variables to the
  theme's tokens, and the canvas takes its light or dark mode from `forceColorMode`, because its
  own `[data-theme='dark']` selectors never match a variety's id.
- **The CSP stays as it is.** The 13.0.3 package has no `eval`, no `new Function`, no injected
  `<style>` and no `blob:`. It writes `style` attributes for positions and transforms, which
  `style-src 'unsafe-inline'` already allows, and Vite bundles its stylesheet.

## Alternatives rejected

- **Hand-written SVG with d3-zoom**: pan, zoom, edge paths, selection, keyboard moves and
  connection handles would all be ours to keep. React Flow is that, on the same d3 modules.
- **tldraw**: a whiteboard, and its licence wants a key or a watermark in production.
- **Excalidraw**: freehand drawing rather than blocks and arrows, and about a megabyte.
- **Mermaid as the editor**: text first, with no dragging. It stays a candidate export format.
- **React Flow 12.12.1**: the previous major. Starting on it means a migration soon after (the
  `useStore` split, change sets, unlayered styles), and 13's layered CSS and `forceColorMode`
  fit the page's Tailwind layers and theme varieties.
- **JointJS and GoJS**: commercial, or not React.

## Consequences

- A page dependency, with zustand, classcat and four d3 modules under it. It sits in the main
  bundle for now; loading the Stack map's route lazily would take it out, and is left for when the
  bundle's size matters.
- A major upgrade touches `web/components/feature-map/`, `web/lib/stack-map-canvas.ts` and
  `web/index.css`, never a saved map.
- The canvas shows React Flow's attribution link (the MIT licence allows hiding it; the project
  asks non-subscribers to keep it). It opens in the browser from the app window.
- Tailwind classes go on our own elements inside a node, never on React Flow's wrappers or
  controls: its `@layer xyflow` is imported after Tailwind's, so it outranks `utilities`. Its
  `.selectable:focus-visible { outline: none }` means the block node draws its own focus ring.
