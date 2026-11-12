import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { inkNightHex, mutedHex, starlightHex, cinnabarHex } from "./theme.js";
import { buildGlyphAtlas } from "./glyphs.js";
import { layoutTargets } from "./layout.js";
import { createDossier } from "./dossier.js";
import { searchChars } from "./search.js";

const REVEAL_MS = 1500;
const TWEEN_MS = 1200;
const FLY_MS = 800;
const BREATH_PERIOD_MS = 9000;
const BREATH_AMPLITUDE = 0.35;
/** HSK 1 keeps this world size; HSK 6 is half of it. */
const GLYPH_SIZE = 1.45;

const vertexShader = /* glsl */ `
  attribute vec4 atlasUv;
  attribute float glyphScale;
  attribute vec3 ink;
  attribute float dim;
  uniform float hoverId;
  uniform float selectedId;
  uniform vec3 cinnabar;
  uniform vec3 night;
  uniform float focal;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    bool hot = abs(float(gl_InstanceID) - hoverId) < 0.5;
    bool chosen = abs(float(gl_InstanceID) - selectedId) < 0.5;
    float boost = hot || chosen ? 1.18 : 1.0;
    vec3 billboard = center
      + camRight * position.x * glyphScale * boost
      + camUp * position.y * glyphScale * boost;
    vec4 clip = projectionMatrix * viewMatrix * vec4(billboard, 1.0);
    float pixels = glyphScale * boost * focal / max(clip.w, 0.001);
    if (pixels < 2.0 && !hot && !chosen) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    } else {
      gl_Position = clip;
    }
    vUv = vec2(atlasUv.x + uv.x * atlasUv.z, atlasUv.y + (1.0 - uv.y) * atlasUv.w);
    vec3 base = chosen ? cinnabar : hot ? mix(ink, vec3(1.0), 0.35) : ink;
    float keep = hot || chosen ? 1.0 : mix(0.25, 1.0, step(0.5, dim));
    vColor = mix(night, base, keep);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec4 texel = texture2D(map, vUv);
    if (texel.a < 0.35) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function hskScale(level) {
  const t = (Math.min(6, Math.max(1, level)) - 1) / 5;
  return GLYPH_SIZE * (1 - t * 0.5);
}

function hskColor(level) {
  const t = ((Math.min(6, Math.max(1, level)) - 1) / 5) * 0.65;
  return new THREE.Color(starlightHex).lerp(new THREE.Color(mutedHex), t);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ chars: { c: string, p: string, m: string, h: number }[], comps: Record<string, number[]>, edges: number[][] }} atlas
 */
export async function createSky(canvas, atlas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tip = document.querySelector("#tip");
  const tipChar = document.querySelector("#tip-char");
  const tipPinyin = document.querySelector("#tip-pinyin");
  const tipMeaning = document.querySelector("#tip-meaning");

  const targets = layoutTargets(atlas);
  const radius = targets.radius;
  const layouts = {
    constellation: targets.constellation,
    levels: targets.levels,
    radicals: targets.radicals,
    phonetic: targets.phonetic,
  };
  let layoutName = "constellation";
  const { texture, rects } = await buildGlyphAtlas(atlas.chars);
  const count = atlas.chars.length;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(inkNightHex, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, radius * 12);
  const rest = new THREE.Vector3(0, radius * 0.08, radius * 2.05);
  camera.position.copy(rest);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = Math.max(4, radius * 0.12);
  controls.maxDistance = radius * 3;
  controls.autoRotate = false;
  controls.target.set(0, 0, 0);

  const scales = new Float32Array(count);
  const inks = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    scales[i] = hskScale(atlas.chars[i].h);
    const color = hskColor(atlas.chars[i].h);
    inks[i * 3] = color.r;
    inks[i * 3 + 1] = color.g;
    inks[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("atlasUv", new THREE.InstancedBufferAttribute(rects, 4));
  geometry.setAttribute("glyphScale", new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("ink", new THREE.InstancedBufferAttribute(inks, 3));
  const dims = new Float32Array(count).fill(1);
  geometry.setAttribute("dim", new THREE.InstancedBufferAttribute(dims, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      hoverId: { value: -1 },
      selectedId: { value: -1 },
      cinnabar: { value: new THREE.Color(cinnabarHex) },
      night: { value: new THREE.Color(inkNightHex) },
      focal: { value: 800 },
    },
    vertexShader,
    fragmentShader,
    depthWrite: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const linePositions = new Float32Array(atlas.edges.length * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: cinnabarHex }),
  );
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);

  const water = waterLinks(atlas, layouts.constellation);
  const introPositions = new Float32Array(Math.max(1, water.length) * 2 * 3);
  const introGeometry = new THREE.BufferGeometry();
  introGeometry.setAttribute("position", new THREE.BufferAttribute(introPositions, 3));
  introGeometry.setDrawRange(0, water.length * 2);
  const introLines = new THREE.LineSegments(
    introGeometry,
    new THREE.LineBasicMaterial({
      color: cinnabarHex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  introLines.frustumCulled = false;
  introLines.visible = false;
  scene.add(introLines);
  const INTRO_DRAW = 1000;
  const INTRO_HOLD = 500;
  const INTRO_FADE = 700;
  let introStart = 0;
  let introPlayed = reducedMotion;

  const shown = new Float32Array(count * 3);
  const from = new Float32Array(count * 3);
  const dummy = new THREE.Object3D();
  const revealDepth = radius * 0.85;
  let tweening = false;
  let tweenStart = 0;

  function writePositions(read) {
    for (let i = 0; i < count; i++) {
      const x = read[i * 3];
      const y = read[i * 3 + 1];
      const z = read[i * 3 + 2];
      shown[i * 3] = x;
      shown[i * 3 + 1] = y;
      shown[i * 3 + 2] = z;
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function placeStars(progress) {
    const eased = easeOutCubic(progress);
    const home = layouts.constellation;
    for (let i = 0; i < count; i++) {
      const hx = home[i * 3];
      const hy = home[i * 3 + 1];
      const hz = home[i * 3 + 2];
      const length = Math.max(1, Math.hypot(hx, hy, hz));
      const extra = revealDepth * (1 - eased);
      const scale = (length + extra) / length;
      from[i * 3] = hx * scale;
      from[i * 3 + 1] = hy * scale;
      from[i * 3 + 2] = hz * scale;
    }
    writePositions(from);
  }

  function blendToward(t) {
    const eased = easeInOutCubic(t);
    const goal = layouts[layoutName];
    for (let i = 0; i < count; i++) {
      const x = from[i * 3] + (goal[i * 3] - from[i * 3]) * eased;
      const y = from[i * 3 + 1] + (goal[i * 3 + 1] - from[i * 3 + 1]) * eased;
      const z = from[i * 3 + 2] + (goal[i * 3 + 2] - from[i * 3 + 2]) * eased;
      shown[i * 3] = x;
      shown[i * 3 + 1] = y;
      shown[i * 3 + 2] = z;
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function goToLayout(name) {
    if (!layouts[name] || (name === layoutName && !tweening && revealDone)) return;
    layoutName = name;
    revealDone = true;
    if (reducedMotion) {
      writePositions(layouts[name]);
      tweening = false;
      return;
    }
    from.set(shown);
    tweenStart = performance.now();
    tweening = true;
  }

  placeStars(reducedMotion ? 1 : 0);

  let revealStart = performance.now();
  let revealDone = reducedMotion;
  let breathing = !reducedMotion;
  let hovered = -1;
  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;

  controls.addEventListener("start", () => {
    breathing = false;
  });

  function setHover(index) {
    if (index === hovered) return;
    hovered = index;
    material.uniforms.hoverId.value = index;
    canvas.style.cursor = index >= 0 ? "pointer" : "";
    if (!tip || !tipChar || !tipPinyin || !tipMeaning) return;
    if (index < 0 || dossier.isOpen) {
      tip.hidden = true;
      return;
    }
    const sign = atlas.chars[index];
    tipChar.textContent = sign.c;
    tipPinyin.textContent = sign.p;
    tipMeaning.textContent = sign.m;
    tip.hidden = false;
    moveTip();
  }

  function moveTip() {
    if (!tip || tip.hidden) return;
    const pad = 14;
    const rect = tip.getBoundingClientRect();
    let left = pointerX + 16;
    let top = pointerY + 16;
    if (left + rect.width > window.innerWidth - pad) left = pointerX - rect.width - 12;
    if (top + rect.height > window.innerHeight - pad) top = pointerY - rect.height - 12;
    tip.style.left = `${Math.max(pad, left)}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
  }

  const projected = new THREE.Vector3();

  function pick() {
    if (!pointerInside) {
      setHover(-1);
      return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const fov = (camera.fov * Math.PI) / 180;
    const pixelsPerUnit = height / (2 * Math.tan(fov / 2));
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      projected.set(shown[i * 3], shown[i * 3 + 1], shown[i * 3 + 2]);
      projected.project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const sx = (projected.x * 0.5 + 0.5) * width;
      const sy = (-projected.y * 0.5 + 0.5) * height;
      const dx = sx - pointerX;
      const dy = sy - pointerY;
      const dist = dx * dx + dy * dy;
      const depth = Math.hypot(
        shown[i * 3] - camera.position.x,
        shown[i * 3 + 1] - camera.position.y,
        shown[i * 3 + 2] - camera.position.z,
      );
      const pixel = (scales[i] / Math.max(depth, 0.001)) * pixelsPerUnit;
      const limit = Math.max(10, pixel * 0.42);
      if (dist <= limit * limit && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    setHover(best);
    if (best >= 0) moveTip();
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    pointerInside = true;
    pick();
  }

  function onPointerLeave() {
    pointerInside = false;
    setHover(-1);
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  let selected = -1;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownHover = -1;
  const fly = {
    active: false,
    start: 0,
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    fromOffset: new THREE.Vector3(),
    toOffset: new THREE.Vector3(),
  };

  const dossier = createDossier(atlas, {
    reducedMotion,
    onJump(index) {
      choose(index, true);
    },
  });

  function syncLines() {
    const positions = lineGeometry.attributes.position;
    if (selected < 0) {
      lines.visible = false;
      lineGeometry.setDrawRange(0, 0);
      return;
    }
    let countPairs = 0;
    for (let e = 0; e < atlas.edges.length; e++) {
      const a = atlas.edges[e][0];
      const b = atlas.edges[e][1];
      if (a !== selected && b !== selected) continue;
      const other = a === selected ? b : a;
      const base = countPairs * 6;
      linePositions[base] = shown[selected * 3];
      linePositions[base + 1] = shown[selected * 3 + 1];
      linePositions[base + 2] = shown[selected * 3 + 2];
      linePositions[base + 3] = shown[other * 3];
      linePositions[base + 4] = shown[other * 3 + 1];
      linePositions[base + 5] = shown[other * 3 + 2];
      countPairs += 1;
    }
    positions.needsUpdate = true;
    lineGeometry.setDrawRange(0, countPairs * 2);
    lines.visible = countPairs > 0;
  }

  function flyTo(index) {
    breathing = false;
    const target = new THREE.Vector3(shown[index * 3], shown[index * 3 + 1], shown[index * 3 + 2]);
    const offset = camera.position.clone().sub(controls.target);
    const distance = Math.max(offset.length(), 0.001);
    const nextDistance = Math.min(distance, Math.max(controls.minDistance * 1.4, radius * 0.42));
    if (reducedMotion) {
      controls.target.copy(target);
      camera.position.copy(target).add(offset.multiplyScalar(nextDistance / distance));
      fly.active = false;
      return;
    }
    fly.fromTarget.copy(controls.target);
    fly.toTarget.copy(target);
    fly.fromOffset.copy(offset);
    fly.toOffset.copy(offset).multiplyScalar(nextDistance / distance);
    fly.start = performance.now();
    fly.active = true;
  }

  function stepFly(now) {
    if (!fly.active) return;
    const t = Math.min(1, (now - fly.start) / FLY_MS);
    const eased = easeInOutCubic(t);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, eased);
    camera.position.copy(controls.target).addScaledVector(
      fly.fromOffset.clone().lerp(fly.toOffset, eased),
      1,
    );
    if (t >= 1) fly.active = false;
  }

  function choose(index, flyCamera) {
    selected = index;
    material.uniforms.selectedId.value = index;
    if (tip) tip.hidden = true;
    dossier.open(index, true);
    syncLines();
    if (flyCamera) flyTo(index);
  }

  function dismiss() {
    if (!dossier.isOpen && selected < 0) return;
    selected = -1;
    material.uniforms.selectedId.value = -1;
    fly.active = false;
    dossier.close();
    syncLines();
    const back = document.querySelector("#layouts button");
    if (back instanceof HTMLElement) back.focus();
  }

  function onPointerDown(event) {
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    onPointerMove(event);
    pointerDownHover = hovered;
  }

  function onPointerUp(event) {
    if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > 6) return;
    if (pointerDownHover >= 0) choose(pointerDownHover, false);
    else dismiss();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") dismiss();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);

  const layoutButtons = [...document.querySelectorAll("#layouts button")];
  function onLayoutClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    const name = button.dataset.layout;
    if (!name) return;
    for (const other of layoutButtons) {
      other.setAttribute("aria-pressed", other === button ? "true" : "false");
    }
    goToLayout(name);
  }
  for (const button of layoutButtons) {
    button.addEventListener("click", onLayoutClick);
  }

  const queryInput = document.querySelector("#query");
  const hitList = document.querySelector("#hits");
  const hskFilter = document.querySelector("#filter-hsk");
  const strokeFilter = document.querySelector("#filter-strokes");
  const radicalFilter = document.querySelector("#filter-radical");

  if (radicalFilter instanceof HTMLSelectElement) {
    const radicals = [...new Set(atlas.chars.map((sign) => sign.r).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "zh"),
    );
    for (const radical of radicals) {
      const option = document.createElement("option");
      option.value = radical;
      option.textContent = radical;
      radicalFilter.append(option);
    }
  }

  function applyFilters() {
    const hsk = hskFilter instanceof HTMLSelectElement ? Number(hskFilter.value) : 0;
    const strokes = strokeFilter instanceof HTMLSelectElement ? strokeFilter.value : "";
    const radical = radicalFilter instanceof HTMLSelectElement ? radicalFilter.value : "";
    for (let i = 0; i < count; i++) {
      const sign = atlas.chars[i];
      let keep = true;
      if (hsk) keep = sign.h === hsk;
      if (keep && strokes === "few") keep = sign.n >= 1 && sign.n <= 5;
      if (keep && strokes === "mid") keep = sign.n >= 6 && sign.n <= 10;
      if (keep && strokes === "many") keep = sign.n >= 11;
      if (keep && radical) keep = sign.r === radical;
      dims[i] = keep ? 1 : 0;
    }
    geometry.attributes.dim.needsUpdate = true;
  }

  function showHits(indexes, note) {
    if (!hitList) return;
    hitList.replaceChildren();
    if (note) {
      const empty = document.createElement("p");
      empty.textContent = note;
      hitList.append(empty);
      return;
    }
    for (const index of indexes.slice(0, 8)) {
      const button = document.createElement("button");
      button.type = "button";
      const sign = atlas.chars[index];
      button.textContent = `${sign.c} ${sign.p}`;
      button.addEventListener("click", () => choose(index, true));
      hitList.append(button);
    }
  }

  function runSearch(fly) {
    if (!(queryInput instanceof HTMLInputElement)) return;
    const hits = searchChars(atlas, queryInput.value);
    if (!queryInput.value.trim()) {
      showHits([]);
      return;
    }
    if (hits.length === 0) {
      showHits([], "没有");
      return;
    }
    showHits(hits);
    if (fly) choose(hits[0], true);
  }

  const findForm = document.querySelector("#find");
  function onFindSubmit(event) {
    event.preventDefault();
    runSearch(true);
  }
  function onFindInput() {
    runSearch(false);
  }
  function onFilterChange() {
    applyFilters();
  }
  findForm?.addEventListener("submit", onFindSubmit);
  queryInput?.addEventListener("input", onFindInput);
  hskFilter?.addEventListener("change", onFilterChange);
  strokeFilter?.addEventListener("change", onFilterChange);
  radicalFilter?.addEventListener("change", onFilterChange);

  const meterFps = document.querySelector("#meter-fps");
  const meterChars = document.querySelector("#meter-chars");
  const meterEdges = document.querySelector("#meter-edges");
  if (meterChars) meterChars.textContent = String(count);
  if (meterEdges) meterEdges.textContent = String(atlas.edges.length);
  let fpsStamp = performance.now();
  let fpsFrames = 0;

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const fov = (camera.fov * Math.PI) / 180;
    material.uniforms.focal.value = height / (2 * Math.tan(fov / 2));
    renderer.setSize(width, height, false);
  }

  resize();
  window.addEventListener("resize", resize);

  let frame = 0;

  function stepIntro(now) {
    const elapsed = now - introStart;
    const draw = Math.min(1, elapsed / INTRO_DRAW);
    const eased = easeOutCubic(draw);
    for (let i = 0; i < water.length; i++) {
      const a = water[i][0];
      const b = water[i][1];
      const ax = shown[a * 3];
      const ay = shown[a * 3 + 1];
      const az = shown[a * 3 + 2];
      const bx = shown[b * 3];
      const by = shown[b * 3 + 1];
      const bz = shown[b * 3 + 2];
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const mz = (az + bz) / 2;
      const base = i * 6;
      introPositions[base] = mx + (ax - mx) * eased;
      introPositions[base + 1] = my + (ay - my) * eased;
      introPositions[base + 2] = mz + (az - mz) * eased;
      introPositions[base + 3] = mx + (bx - mx) * eased;
      introPositions[base + 4] = my + (by - my) * eased;
      introPositions[base + 5] = mz + (bz - mz) * eased;
    }
    introGeometry.attributes.position.needsUpdate = true;
    introLines.visible = true;
    const fadeStart = INTRO_DRAW + INTRO_HOLD;
    if (elapsed < fadeStart) introLines.material.opacity = 1;
    else {
      const fade = Math.min(1, (elapsed - fadeStart) / INTRO_FADE);
      introLines.material.opacity = 1 - fade;
      if (fade >= 1) {
        introPlayed = true;
        introLines.visible = false;
      }
    }
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);

    if (!revealDone) {
      const t = Math.min(1, (now - revealStart) / REVEAL_MS);
      placeStars(t);
      if (t >= 1) {
        revealDone = true;
        introStart = now;
      }
      if (pointerInside) pick();
    } else if (tweening) {
      const t = Math.min(1, (now - tweenStart) / TWEEN_MS);
      blendToward(t);
      if (t >= 1) tweening = false;
      if (pointerInside) pick();
    }

    controls.update();
    stepFly(now);
    if (!introPlayed && revealDone && selected < 0) stepIntro(now);
    if (selected >= 0) syncLines();

    let breath = 0;
    if (breathing) {
      const wave = Math.sin((now / BREATH_PERIOD_MS) * Math.PI * 2);
      breath = wave * BREATH_AMPLITUDE;
      camera.position.y += breath;
    }

    renderer.render(scene, camera);

    fpsFrames += 1;
    if (meterFps && now - fpsStamp >= 1000) {
      meterFps.textContent = String(Math.round((fpsFrames * 1000) / (now - fpsStamp)));
      fpsStamp = now;
      fpsFrames = 0;
    }

    if (breath !== 0) camera.position.y -= breath;
  }

  frame = requestAnimationFrame(tick);

  return function dispose() {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    for (const button of layoutButtons) {
      button.removeEventListener("click", onLayoutClick);
    }
    findForm?.removeEventListener("submit", onFindSubmit);
    queryInput?.removeEventListener("input", onFindInput);
    hskFilter?.removeEventListener("change", onFilterChange);
    strokeFilter?.removeEventListener("change", onFilterChange);
    radicalFilter?.removeEventListener("change", onFilterChange);
    controls.dispose();
    geometry.dispose();
    lineGeometry.dispose();
    lines.material.dispose();
    introGeometry.dispose();
    introLines.material.dispose();
    material.dispose();
    texture.dispose();
    renderer.dispose();
  };
}

/** Each 氵 character joins its two nearest siblings. A full clique would be a solid disk. */
function waterLinks(atlas, positions) {
  const members = [];
  for (let i = 0; i < atlas.chars.length; i++) {
    if ((atlas.chars[i].k || []).includes("氵")) members.push(i);
  }
  const pairs = [];
  const seen = new Set();
  for (const i of members) {
    const nearest = [];
    for (const j of members) {
      if (i === j) continue;
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      nearest.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    nearest.sort((a, b) => a.d - b.d);
    for (const item of nearest.slice(0, 2)) {
      const lo = Math.min(i, item.j);
      const hi = Math.max(i, item.j);
      const key = `${lo},${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([lo, hi]);
    }
  }
  return pairs;
}
