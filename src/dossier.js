/** Side dossier. The sky stays visible; this panel only reads atlas.json. */

const STROKE_MS = 420;

/**
 * @param {{ chars: object[], comps: Record<string, number[]> }} atlas
 * @param {{ onJump: (index: number) => void, reducedMotion: boolean }} options
 */
export function createDossier(atlas, options) {
  const root = document.querySelector("#dossier");
  const indexByChar = new Map(atlas.chars.map((sign, index) => [sign.c, index]));
  let current = -1;
  let filterLevel = 0;
  let strokeFrame = 0;
  let strokeToken = 0;

  if (!root) {
    return {
      open() {},
      close() {},
      get isOpen() {
        return false;
      },
    };
  }

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.matches("[data-filter]")) return;
    filterLevel = Number(target.value) || 0;
    paintWords();
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-replay]")) {
      paintStrokes(true);
      return;
    }
    const jump = target.closest("[data-jump]");
    if (!(jump instanceof HTMLElement)) return;
    const index = Number(jump.dataset.jump);
    if (Number.isInteger(index)) options.onJump(index);
  });

  function open(index, focusReplay) {
    current = index;
    root.dataset.open = "true";
    root.inert = false;
    root.setAttribute("aria-hidden", "false");
    paint();
    if (focusReplay) {
      const replay = root.querySelector("[data-replay]");
      if (replay instanceof HTMLElement) replay.focus();
    }
  }

  function close() {
    current = -1;
    strokeToken += 1;
    cancelAnimationFrame(strokeFrame);
    root.dataset.open = "false";
    root.inert = true;
    root.setAttribute("aria-hidden", "true");
  }

  function paint() {
    const sign = atlas.chars[current];
    const glyph = root.querySelector("[data-glyph]");
    const pinyin = root.querySelector("[data-pinyin]");
    const meaning = root.querySelector("[data-meaning]");
    if (glyph) glyph.textContent = sign.c;
    if (pinyin) pinyin.textContent = sign.p || "";
    if (meaning) meaning.textContent = sign.m || "";
    paintParts(sign);
    paintWords();
    paintOccurs(sign);
    paintStrokes(false);
  }

  function paintParts(sign) {
    const list = root.querySelector("[data-parts]");
    if (!list) return;
    list.replaceChildren();
    const parts = sign.k || [];
    if (parts.length === 0) {
      list.append(note("没有部件。"));
      return;
    }
    for (const part of parts) {
      const index = indexByChar.get(part);
      if (index == null || index === current) {
        const span = document.createElement("span");
        span.className = "part-quiet";
        span.textContent = part;
        list.append(span);
        continue;
      }
      list.append(jumpButton(part, index));
    }
  }

  function paintWords() {
    const list = root.querySelector("[data-words]");
    if (!list || current < 0) return;
    list.replaceChildren();
    const words = (atlas.chars[current].w || []).filter((word) => {
      if (filterLevel === 0) return true;
      return typeof word.h === "number" && word.h <= filterLevel;
    });
    if (words.length === 0) {
      list.append(note("没有这个级别的例子。"));
      return;
    }
    for (const word of words) {
      const row = document.createElement("li");
      const head = document.createElement("span");
      head.className = "word-zh";
      head.textContent = word.z;
      const py = document.createElement("span");
      py.className = "word-py";
      py.textContent = word.p;
      const gloss = document.createElement("span");
      gloss.className = "word-en";
      gloss.textContent = word.m;
      row.append(head, py, gloss);
      list.append(row);
    }
  }

  function paintOccurs(sign) {
    const list = root.querySelector("[data-occurs]");
    if (!list) return;
    list.replaceChildren();
    const members = atlas.comps[sign.c] || [];
    const others = members.filter((index) => index !== current);
    if (others.length === 0) {
      list.append(note("没有。"));
      return;
    }
    for (const index of others) {
      list.append(jumpButton(atlas.chars[index].c, index));
    }
  }

  function paintStrokes(replay) {
    const svg = root.querySelector("[data-strokes]");
    if (!(svg instanceof SVGSVGElement) || current < 0) return;
    const sign = atlas.chars[current];
    const paths = sign.t?.d || [];
    svg.replaceChildren();
    strokeToken += 1;
    const token = strokeToken;
    cancelAnimationFrame(strokeFrame);
    if (paths.length === 0) return;

    // Make Me a Hanzi stores strokes with Y up. SVG has Y down.
    // scale(1,-1) then translate(0,-900) maps that square onto the viewBox.
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("transform", "scale(1, -1) translate(0, -900)");
    svg.append(group);
    const drawn = paths.map((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      group.append(path);
      return path;
    });

    if (options.reducedMotion) {
      for (const path of drawn) path.style.strokeDashoffset = "0";
      return;
    }

    for (const path of drawn) {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
    }
    if (!replay && root.dataset.open !== "true") return;
    drawStroke(drawn, 0, token);
  }

  function drawStroke(paths, index, token) {
    if (token !== strokeToken || index >= paths.length) return;
    const path = paths[index];
    const length = path.getTotalLength();
    const start = performance.now();
    function frame(now) {
      if (token !== strokeToken) return;
      const t = Math.min(1, (now - start) / STROKE_MS);
      path.style.strokeDashoffset = String(length * (1 - t));
      if (t < 1) strokeFrame = requestAnimationFrame(frame);
      else drawStroke(paths, index + 1, token);
    }
    strokeFrame = requestAnimationFrame(frame);
  }

  function jumpButton(label, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jump";
    button.dataset.jump = String(index);
    button.textContent = label;
    return button;
  }

  function note(text) {
    const item = document.createElement("p");
    item.className = "dossier-empty";
    item.textContent = text;
    return item;
  }

  return {
    open,
    close,
    get isOpen() {
      return current >= 0;
    },
  };
}
