# How it works

One page for a defense. The scene is vanilla Three.js r170. The browser
only loads `public/data/atlas.json`. It never parses CEDICT or Unihan.

## Graph and layout

A character keeps the components from its Ideographic Description
Sequence (`k` in the JSON). An edge exists only when a component is shared
by 2–24 characters. 口 and 氵 are more common than that, so they stay in
the component index and do not become a complete clique. That is why the
file has 12537 links, not hundreds of thousands.

星图 is computed once, at load. Each character starts near its rarest
usable component. Springs pull along edges. Repulsion acts only when two
characters are about to overlap. After about 140 steps the positions are
frozen. Switching to 阶, 宿, or 形声 does not rebuild the mesh. It
interpolates each star from where it is to a stored target, in about 1.2
seconds.

## Why the frame rate holds

All 2663 glyphs are one `InstancedMesh`. Noto Serif SC is drawn once into
a texture atlas. The vertex shader turns each instance into a camera-facing
quad and samples that glyph's rectangle. One draw call, no per-character
object. Glyphs that would cover fewer than about two pixels are skipped,
unless they are hovered or selected. The counter in the corner
(字 / 线 / 帧) is the live frame time, updated about once a second.

## Stroke animation

Make Me a Hanzi stores each stroke as an SVG path in a 1024 box (`t.d`).
The dossier draws those paths in order on a page canvas, not in WebGL.
Replay starts the sequence again. If the system asks for reduced motion,
every stroke is shown at once and the opening 氵 lines are skipped.

## What to film

Six shots, one idea each:

1. Reload. Stars rise out of the dark, the 氵 lines draw in cinnabar, then fade.
2. Orbit through the 星图 clusters.
3. Switch to 阶 (nested spheres), then to 宿 (the ring of radical houses).
4. Click a star. Strokes draw in order. Cinnabar lines reach characters that share a component.
5. Search `shui`. The camera flies to 水 and the dossier opens.
6. Set 级别 to HSK 1. Matching stars stay bright. The rest dim and stay in place.

## Numbers for a slide

- 2663 characters, HSK 2.0 levels 1–6
- 12537 links
- Frame rate: read 帧 on the machine you present with. A development browser in this project showed about 120 frames per second. That is not a measurement on a weak laptop. Write down the counter from the laptop you will actually use.
