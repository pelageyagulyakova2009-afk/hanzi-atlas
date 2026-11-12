/** Same cap as the atlas edges: a component shared more widely is not a cluster seed. */
const MAX_MEMBERS = 24;
const ITERATIONS = 140;
const CELL = 6;
/** Spring rest length, in the same units as the starting sphere. */
const REST = 2.2;
const SPRING = 0.05;
/** Push only when two signs overlap. A long-range force turns the sky into one ball. */
const REPEL = 0.25;
const GRAVITY = 0.015;
const DAMPING = 0.45;
/** Explicit Euler blows up if one step is allowed to jump across a cluster. */
const MAX_SPEED = 1.2;
const SPHERE = 46;

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One pass of 星图. Positions are frozen afterwards; the render loop only
 * interpolates the opening move.
 * @param {{ chars: { k: string[] }[], comps: Record<string, number[]>, edges: number[][] }} atlas
 * @returns {{ positions: Float32Array, radius: number }}
 */
export function layoutConstellation(atlas) {
  const count = atlas.chars.length;
  const positions = new Float32Array(count * 3);
  const homes = componentHomes(atlas.comps);
  const random = mulberry32(0x5f3759df);

  for (let i = 0; i < count; i++) {
    const name = rarestComponent(atlas.chars[i].k, atlas.comps);
    const home = name ? homes.get(name) : null;
    if (home) {
      positions[i * 3] = home[0] * SPHERE + (random() - 0.5) * 2.5;
      positions[i * 3 + 1] = home[1] * SPHERE + (random() - 0.5) * 2.5;
      positions[i * 3 + 2] = home[2] * SPHERE + (random() - 0.5) * 2.5;
    } else {
      positions[i * 3] = (random() - 0.5) * 16;
      positions[i * 3 + 1] = (random() - 0.5) * 16;
      positions[i * 3 + 2] = (random() - 0.5) * 16;
    }
  }

  const velocity = new Float32Array(count * 3);
  const force = new Float32Array(count * 3);

  for (let step = 0; step < ITERATIONS; step++) {
    force.fill(0);
    repelNearby(positions, force, count);
    attractEdges(positions, force, atlas.edges);
    for (let i = 0; i < count; i++) {
      force[i * 3] -= positions[i * 3] * GRAVITY;
      force[i * 3 + 1] -= positions[i * 3 + 1] * GRAVITY;
      force[i * 3 + 2] -= positions[i * 3 + 2] * GRAVITY;
      let vx = (velocity[i * 3] + force[i * 3]) * DAMPING;
      let vy = (velocity[i * 3 + 1] + force[i * 3 + 1]) * DAMPING;
      let vz = (velocity[i * 3 + 2] + force[i * 3 + 2]) * DAMPING;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > MAX_SPEED) {
        const limit = MAX_SPEED / speed;
        vx *= limit;
        vy *= limit;
        vz *= limit;
      }
      velocity[i * 3] = vx;
      velocity[i * 3 + 1] = vy;
      velocity[i * 3 + 2] = vz;
      positions[i * 3] += vx;
      positions[i * 3 + 1] += vy;
      positions[i * 3 + 2] += vz;
    }
  }

  // The simulation runs in small units so the springs stay stable.
  // Scale up afterwards so a glyph does not cover its whole cluster.
  const spread = 4;
  for (let i = 0; i < count; i++) {
    positions[i * 3] *= spread;
    positions[i * 3 + 1] *= spread;
    positions[i * 3 + 2] *= spread;
  }

  let radius = 1;
  for (let i = 0; i < count; i++) {
    const distance = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    if (distance > radius) radius = distance;
  }
  return { positions, radius };
}

function rarestComponent(names, comps) {
  let best = null;
  let bestSize = Infinity;
  if (!names) return null;
  for (const name of names) {
    const members = comps[name];
    if (!members) continue;
    const size = members.length;
    if (size < 2 || size > MAX_MEMBERS || size >= bestSize) continue;
    best = name;
    bestSize = size;
  }
  return best;
}

/** Even points on a unit sphere, one per cluster-sized component. */
function componentHomes(comps) {
  const names = Object.keys(comps).filter((name) => {
    const size = comps[name].length;
    return size >= 2 && size <= MAX_MEMBERS;
  });
  const homes = new Map();
  const count = names.length || 1;
  const golden = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < names.length; i++) {
    const y = 1 - (2 * i + 1) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    homes.set(names[i], [Math.cos(theta) * ring, y, Math.sin(theta) * ring]);
  }
  return homes;
}

function repelNearby(positions, force, count) {
  const grid = new Map();
  for (let i = 0; i < count; i++) {
    const key = cellKey(positions, i);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  for (let i = 0; i < count; i++) {
    const gx = Math.floor(positions[i * 3] / CELL);
    const gy = Math.floor(positions[i * 3 + 1] / CELL);
    const gz = Math.floor(positions[i * 3 + 2] / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            pushApart(positions, force, i, j);
          }
        }
      }
    }
  }
}

function cellKey(positions, index) {
  const gx = Math.floor(positions[index * 3] / CELL);
  const gy = Math.floor(positions[index * 3 + 1] / CELL);
  const gz = Math.floor(positions[index * 3 + 2] / CELL);
  return `${gx},${gy},${gz}`;
}

function pushApart(positions, force, i, j) {
  let x = positions[i * 3] - positions[j * 3];
  let y = positions[i * 3 + 1] - positions[j * 3 + 1];
  let z = positions[i * 3 + 2] - positions[j * 3 + 2];
  let distanceSq = x * x + y * y + z * z;
  if (distanceSq < 0.04) distanceSq = 0.04;
  const distance = Math.sqrt(distanceSq);
  if (distance > REST) return;
  const magnitude = (REST - distance) * REPEL;
  x = (x / distance) * magnitude;
  y = (y / distance) * magnitude;
  z = (z / distance) * magnitude;
  force[i * 3] += x;
  force[i * 3 + 1] += y;
  force[i * 3 + 2] += z;
  force[j * 3] -= x;
  force[j * 3 + 1] -= y;
  force[j * 3 + 2] -= z;
}

function attractEdges(positions, force, edges) {
  for (let e = 0; e < edges.length; e++) {
    const i = edges[e][0];
    const j = edges[e][1];
    let x = positions[j * 3] - positions[i * 3];
    let y = positions[j * 3 + 1] - positions[i * 3 + 1];
    let z = positions[j * 3 + 2] - positions[i * 3 + 2];
    const distance = Math.hypot(x, y, z) || 0.001;
    const magnitude = (distance - REST) * SPRING;
    x = (x / distance) * magnitude;
    y = (y / distance) * magnitude;
    z = (z / distance) * magnitude;
    force[i * 3] += x;
    force[i * 3 + 1] += y;
    force[i * 3 + 2] += z;
    force[j * 3] -= x;
    force[j * 3 + 1] -= y;
    force[j * 3 + 2] -= z;
  }
}

/**
 * Four frozen skies. The other three are scaled to the constellation radius
 * so a layout change does not jump the camera.
 * @param {{ chars: { h: number, r: string, f: string, k: string[] }[], comps: Record<string, number[]>, edges: number[][] }} atlas
 */
export function layoutTargets(atlas) {
  const constellation = layoutConstellation(atlas);
  const radius = constellation.radius;
  return {
    radius,
    constellation: constellation.positions,
    levels: fitRadius(layoutLevels(atlas), radius),
    radicals: fitRadius(layoutRadicals(atlas), radius),
    phonetic: fitRadius(layoutPhonetic(atlas), radius),
  };
}

function layoutLevels(atlas) {
  const positions = new Float32Array(atlas.chars.length * 3);
  const buckets = [[], [], [], [], [], []];
  atlas.chars.forEach((sign, index) => {
    const level = Math.min(6, Math.max(1, sign.h)) - 1;
    buckets[level].push(index);
  });
  const random = mulberry32(0x214);
  for (let level = 0; level < 6; level++) {
    const members = buckets[level];
    const shell = 10 + level * 11;
    members.forEach((index, order) => {
      const point = spherePoint(order, members.length);
      const jitter = (random() - 0.5) * 0.8;
      positions[index * 3] = point[0] * shell + jitter;
      positions[index * 3 + 1] = point[1] * shell + jitter;
      positions[index * 3 + 2] = point[2] * shell + jitter;
    });
  }
  return positions;
}

function layoutRadicals(atlas) {
  const positions = new Float32Array(atlas.chars.length * 3);
  const groups = new Map();
  atlas.chars.forEach((sign, index) => {
    const name = sign.r || "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(index);
  });
  const names = [...groups.keys()].sort();
  const ring = 52;
  names.forEach((name, house) => {
    const theta = (house / names.length) * Math.PI * 2;
    // Ring faces the opening camera (it sits on +Z), so the houses read as a circle.
    const centerX = Math.cos(theta) * ring;
    const centerY = Math.sin(theta) * ring;
    const members = groups.get(name);
    const spread = 1.4 + Math.sqrt(members.length) * 0.45;
    members.forEach((index, order) => {
      const point = spherePoint(order, members.length);
      positions[index * 3] = centerX + point[0] * spread;
      positions[index * 3 + 1] = centerY + point[1] * spread;
      positions[index * 3 + 2] = point[2] * spread * 0.55;
    });
  });
  return positions;
}

function layoutPhonetic(atlas) {
  const positions = new Float32Array(atlas.chars.length * 3);
  const groups = new Map();
  atlas.chars.forEach((sign, index) => {
    const name = sign.f || "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(index);
  });
  const named = [...groups.keys()].filter((name) => name !== "").sort();
  named.forEach((name, order) => {
    const point = spherePoint(order, named.length);
    const members = groups.get(name);
    const spread = 1.3 + Math.sqrt(members.length) * 0.55;
    const shell = 48;
    members.forEach((index, member) => {
      const local = spherePoint(member, members.length);
      positions[index * 3] = point[0] * shell + local[0] * spread;
      positions[index * 3 + 1] = point[1] * shell + local[1] * spread;
      positions[index * 3 + 2] = point[2] * shell + local[2] * spread;
    });
  });
  const quiet = groups.get("") || [];
  quiet.forEach((index, order) => {
    const point = spherePoint(order, quiet.length);
    const shell = 8;
    positions[index * 3] = point[0] * shell;
    positions[index * 3 + 1] = point[1] * shell;
    positions[index * 3 + 2] = point[2] * shell;
  });
  return positions;
}

/** Even points on the unit sphere. One point sits at the top. */
function spherePoint(index, count) {
  if (count <= 1) return [0, 0, 0];
  const y = 1 - (2 * index + 1) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * ring, y, Math.sin(theta) * ring];
}

function fitRadius(positions, target) {
  let radius = 1;
  for (let i = 0; i < positions.length; i += 3) {
    const distance = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
    if (distance > radius) radius = distance;
  }
  const scale = target / radius;
  for (let i = 0; i < positions.length; i++) positions[i] *= scale;
  return positions;
}
