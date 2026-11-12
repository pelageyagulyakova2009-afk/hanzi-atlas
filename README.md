# 汉字星图 · Hanzi Atlas

An interactive 3D atlas of Chinese characters. Each character is a star.
Characters that share a component draw constellation lines. About 2,663
signs from HSK 2.0 (levels 1–6) sit in one scene.

Four layouts, switched by moving the same stars:

- 星图 constellations, grouped by a shared component
- 阶 levels, concentric spheres from HSK 1 to HSK 6
- 宿 radical houses, set in a ring
- 形声 phonetic groups

Click a star to open 字源: stroke order, pinyin, meaning, components,
example words, and other characters that contain it.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
npm run build
npm run preview
```

Data sources and licenses are in [CREDITS.md](CREDITS.md). How the graph,
the instanced glyphs, and the stroke animation work is in
[HOW-IT-WORKS.md](HOW-IT-WORKS.md). Rebuilding `atlas.json` from the raw
files is described in [scripts/README.md](scripts/README.md).

---

# 汉字星图

交互式三维汉字图集。每个字是一颗星，共用同一部件的字之间连成星座线。
图中约有 HSK 2.0（1–6 级）的 2663 个字。

四种布局，切换时星星只是移动，场景不重建：

- 星图：按共同部件聚成星团
- 阶：HSK 1 在内、HSK 6 在外的同心球面
- 宿：按部首分成的“房屋”，排成一圈
- 形声：按同一声旁分组

点击一颗星打开「字源」：笔顺、拼音、释义、部件、例词，以及包含该部件的其他字。

## 运行

```bash
npm install
npm run dev
```

打开 Vite 打印的地址（通常是 http://localhost:5173）。

```bash
npm run build
npm run preview
```

数据来源与许可证见 [CREDITS.md](CREDITS.md)。图的结构、实例化字形和笔顺动画见
[HOW-IT-WORKS.md](HOW-IT-WORKS.md)。从原始文件重新生成 `atlas.json` 的步骤见
[scripts/README.md](scripts/README.md)。
