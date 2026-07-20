# Spherical Light Display

Interactive geodesic spherical light display prototype — built with **Three.js**, hosted on **GitHub Pages**.

## Features

- **Multi-layer geodesic sphere** — nested icosphere lattice with configurable layers, radii, and per-layer opacity
- **Additive bloom glow** — UnrealBloomPass post-processing for realistic light node glow
- **Node editor** — click any node to edit color, opacity, and status (active/defective)
- **TransformControls** — drag nodes to reposition them in 3D space
- **Program timeline** — keyframe-based color/opacity sequencing with interpolation
- **Play / Loop / Stop** — real-time animation playback with scrubber
- **Save / Load** — localStorage persistence; multiple named programs
- **Export / Import** — JSON file sharing of light programs
- **Troubleshoot mode** — fade outer layers, highlight defective nodes in red

## Stack

| Layer | Tech |
|---|---|
| Renderer | Three.js (ESM via importmap) |
| Post-processing | UnrealBloomPass |
| Controls | OrbitControls + TransformControls |
| Persistence | localStorage (single-user) |
| Hosting | GitHub Pages |

## Quick Start

```bash
# No build step needed — open index.html directly or serve via any static server
npx serve .
```

Or enable **GitHub Pages** on the `main` branch root to deploy instantly.

## Controls

| Action | Control |
|---|---|
| Rotate view | Left-drag |
| Zoom | Scroll wheel |
| Pan | Right-drag |
| Select node | Click |
| Move node | Drag (when selected) |
| Deselect | Click empty space |

## Configuration

Edit the constants at the top of `main.js`:

```js
const NUM_LAYERS = 3;       // number of concentric shells
const BASE_RADIUS = 2;      // innermost shell radius
const LAYER_SPACING = 0.7;  // gap between shells
const SUBDIVISIONS = 2;     // geodesic frequency (higher = more nodes)
```
