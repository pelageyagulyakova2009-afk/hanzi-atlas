import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRaw, rawDir } from "./fetch-raw.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "public/data/atlas.json");

const IDC_START = 0x2ff0;
const IDC_END = 0x2fff;
/** Shared by more characters than this, a component is not turned into a clique. */
const MAX_EDGE_MEMBERS = 24;

const TONE = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
};

await ensureRaw();

const hskChars = [];
const seenChar = new Set();
for (let level = 1; level <= 6; level++) {
  const list = JSON.parse(
    await readFile(path.join(rawDir, `HSK2.0_chars_level${level}.json`), "utf8"),
  );
  for (const char of list) {
    if (seenChar.has(char)) continue;
    seenChar.add(char);
    hskChars.push({ char, hsk: level });
  }
}

const hskWordLevel = new Map();
for (let level = 1; level <= 6; level++) {
  const list = JSON.parse(
    await readFile(path.join(rawDir, `HSK2.0_words_level${level}.json`), "utf8"),
  );
  for (const word of list) {
    if (!hskWordLevel.has(word)) hskWordLevel.set(word, level);
  }
}

const mandarin = new Map();
const radicalNumber = new Map();
const totalStrokes = new Map();

await readUnihan(path.join(rawDir, "Unihan_Readings.txt"), (cp, field, value) => {
  if (field === "kMandarin") mandarin.set(cp, value.split(/\s+/)[0]);
});
await readUnihan(path.join(rawDir, "Unihan_RadicalStrokeCounts.txt"), (cp, field, value) => {
  if (field === "kRSUnicode") {
    const number = Number.parseInt(value, 10);
    if (number >= 1 && number <= 214) radicalNumber.set(cp, number);
  } else if (field === "kTotalStrokes") {
    const number = Number.parseInt(value, 10);
    if (Number.isFinite(number)) totalStrokes.set(cp, number);
  }
});

const dictionary = new Map();
await readJsonLines(path.join(rawDir, "dictionary.txt"), (row) => {
  if (!seenChar.has(row.character)) return;
  dictionary.set(row.character, row);
});

const graphics = new Map();
await readJsonLines(path.join(rawDir, "graphics.txt"), (row) => {
  if (!seenChar.has(row.character)) return;
  graphics.set(row.character, row);
});

const glossEntries = new Map();
const wordLists = new Map();
for (const { char } of hskChars) wordLists.set(char, []);

await readCedict(path.join(rawDir, "cedict.txt.gz"), (entry) => {
  if ([...entry.simplified].length === 1 && seenChar.has(entry.simplified)) {
    if (!glossEntries.has(entry.simplified)) glossEntries.set(entry.simplified, []);
    glossEntries.get(entry.simplified).push(entry);
  }
  const unique = new Set([...entry.simplified].filter((char) => seenChar.has(char)));
  for (const char of unique) {
    wordLists.get(char).push(entry);
  }
});

const chars = [];
let missingGraphics = 0;
let missingMeaning = 0;
let missingPinyin = 0;
let strokeMismatch = 0;

for (const { char, hsk } of hskChars) {
  const dict = dictionary.get(char);
  const drawn = graphics.get(char);
  const medians = roundMedians(drawn?.medians);
  const paths = Array.isArray(drawn?.strokes) ? drawn.strokes : [];
  if (paths.length === 0 && medians.length === 0) missingGraphics += 1;

  const pinyin = mandarin.get(char) || firstString(dict?.pinyin) || "";
  if (!pinyin) missingPinyin += 1;

  const meaning =
    pickGloss(glossEntries.get(char), pinyin) ||
    (typeof dict?.definition === "string" ? dict.definition : "") ||
    "";
  if (!meaning) missingMeaning += 1;

  let radical = typeof dict?.radical === "string" && dict.radical ? dict.radical : "";
  if (!radical) {
    const number = radicalNumber.get(char);
    if (number) radical = String.fromCodePoint(0x2f00 + number - 1);
  }

  let strokeCount = totalStrokes.get(char);
  if (strokeCount == null) strokeCount = medians.length > 0 ? medians.length : null;
  if (totalStrokes.has(char) && medians.length > 0 && totalStrokes.get(char) !== medians.length) {
    strokeMismatch += 1;
  }

  const components = componentsFrom(dict?.decomposition);
  const phonetic = phoneticOf(dict);

  const words = wordLists
    .get(char)
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      const multiA = [...a.simplified].length > 1 ? 0 : 1;
      const multiB = [...b.simplified].length > 1 ? 0 : 1;
      if (multiA !== multiB) return multiA - multiB;
      const levelA = a.hsk ?? 99;
      const levelB = b.hsk ?? 99;
      if (levelA !== levelB) return levelA - levelB;
      const lenA = [...a.simplified].length;
      const lenB = [...b.simplified].length;
      if (lenA !== lenB) return lenA - lenB;
      return a.index - b.index;
    })
    .slice(0, 4)
    .map((entry) => ({
      z: entry.simplified,
      p: entry.pinyin,
      m: entry.meaning,
      h: entry.hsk,
    }));

  chars.push({
    c: char,
    p: pinyin,
    m: meaning,
    h: hsk,
    r: radical,
    n: strokeCount,
    k: components,
    f: phonetic,
    t: { d: paths, q: medians },
    w: words,
  });
}

const comps = {};
chars.forEach((row, index) => {
  for (const component of row.k) {
    if (!comps[component]) comps[component] = [];
    comps[component].push(index);
  }
});

const edgeSet = new Set();
let largeComponents = 0;
for (const members of Object.values(comps)) {
  if (members.length > MAX_EDGE_MEMBERS) {
    largeComponents += 1;
    continue;
  }
  if (members.length < 2) continue;
  for (let a = 0; a < members.length; a++) {
    for (let b = a + 1; b < members.length; b++) {
      const lo = Math.min(members[a], members[b]);
      const hi = Math.max(members[a], members[b]);
      edgeSet.add(`${lo},${hi}`);
    }
  }
}
const edges = [...edgeSet].map((pair) => pair.split(",").map(Number));

const atlas = {
  keys: {
    c: "char",
    p: "pinyin",
    m: "meaning",
    h: "hsk",
    r: "radical",
    n: "strokeCount",
    k: "components",
    f: "phonetic",
    t: "strokes",
    d: "strokePaths",
    q: "medians",
    w: "words",
    z: "word",
    edges: "character index pairs sharing a component that occurs on 2–24 characters",
    comps: "component to character indexes",
  },
  chars,
  edges,
  comps,
};

const json = JSON.stringify(atlas);
await writeFile(outFile, json);

const bytes = Buffer.byteLength(json);
console.log(`chars ${chars.length}`);
console.log(`components ${Object.keys(comps).length}`);
console.log(`edges ${edges.length}`);
console.log(`bytes ${bytes}`);
console.log(`missing graphics ${missingGraphics}`);
console.log(`missing meaning ${missingMeaning}`);
console.log(`missing pinyin ${missingPinyin}`);
console.log(`stroke count differs from medians ${strokeMismatch}`);
console.log(`components too common for edges ${largeComponents}`);
console.log(`with phonetic ${chars.filter((row) => row.f).length}`);

for (const sample of ["水", "你", "国"]) {
  const row = chars.find((item) => item.c === sample);
  if (!row) {
    console.log(`${sample} not in atlas`);
    continue;
  }
  const word = row.w[0] ? `${row.w[0].z} ${row.w[0].p} ${row.w[0].m}` : "";
  console.log(
    `${row.c} hsk=${row.h} pinyin=${row.p} radical=${row.r} strokes=${row.n} medians=${row.t.q.length} meaning=${row.m} word=${word}`,
  );
}

if (chars.length < 2000 || chars.length > 3500) {
  console.error(`character count ${chars.length} is outside 2000–3500`);
  process.exit(1);
}

/**
 * CEDICT lists a surname reading before the common one (`Shui3` then `shui3`).
 * Keep the gloss whose pinyin matches kMandarin, and skip a leading "surname"
 * sense when the same reading has another sense.
 */
function pickGloss(entries, reading) {
  if (!entries || entries.length === 0) return "";
  const wanted = (reading || "").toLowerCase();
  const same = entries.filter((entry) => entry.pinyin.toLowerCase() === wanted);
  const pool = same.length > 0 ? same : entries;
  const ordinary = pool.filter((entry) => !/^surname\b/i.test(entry.meaning));
  return (ordinary[0] || pool[0]).meaning;
}

function firstString(value) {
  if (Array.isArray(value)) return value.find((item) => typeof item === "string" && item) || "";
  return "";
}

/** Make Me a Hanzi marks the sound-bearing piece only on pictophonetic characters. */
function phoneticOf(dict) {
  const etymology = dict?.etymology;
  if (!etymology || etymology.type !== "pictophonetic") return "";
  const value = etymology.phonetic;
  if (typeof value !== "string") return "";
  const glyphs = [...value];
  if (glyphs.length !== 1) return "";
  if (glyphs[0] === "？" || glyphs[0] === "?") return "";
  return glyphs[0];
}

function componentsFrom(decomposition) {
  if (typeof decomposition !== "string") return [];
  const found = [];
  const seen = new Set();
  for (const symbol of decomposition) {
    const code = symbol.codePointAt(0);
    if (code >= IDC_START && code <= IDC_END) continue;
    if (symbol === "？" || symbol === "?") continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    found.push(symbol);
  }
  return found;
}

function roundMedians(medians) {
  if (!Array.isArray(medians)) return [];
  return medians.map((stroke) =>
    stroke.map(([x, y]) => [Math.round(x), Math.round(y)]),
  );
}

/**
 * CEDICT numbers the tone (`zhong1`). The mark goes on a/e, else o, else the
 * second vowel of iu/ui, else the last vowel. Tone 5 is neutral and unmarked.
 */
function toneSyllable(syllable) {
  const match = syllable.match(/^([A-Za-z:üÜvV]+)([1-5])$/);
  if (!match) return syllable;
  let body = match[1].replace(/u:/gi, "ü").replace(/v/g, "ü").replace(/V/g, "Ü");
  const tone = Number(match[2]);
  if (tone === 5) return body;
  const lower = body.toLowerCase();
  let index = indexOfToneVowel(lower);
  if (index < 0) return body;
  const original = body[index];
  const base = original.toLowerCase();
  const marked = TONE[base][tone - 1];
  const next = original === original.toUpperCase() ? marked.toUpperCase() : marked;
  return body.slice(0, index) + next + body.slice(index + 1);
}

function indexOfToneVowel(lower) {
  const a = lower.indexOf("a");
  if (a !== -1) return a;
  const e = lower.indexOf("e");
  if (e !== -1) return e;
  const o = lower.indexOf("o");
  if (o !== -1) return o;
  const iu = lower.indexOf("iu");
  if (iu !== -1) return iu + 1;
  const ui = lower.indexOf("ui");
  if (ui !== -1) return ui + 1;
  for (let i = lower.length - 1; i >= 0; i--) {
    if ("iuü".includes(lower[i])) return i;
  }
  return -1;
}

function cleanGloss(text) {
  return text
    .replace(/([\p{Script=Han}]+)\|([\p{Script=Han}]+)/gu, "$2")
    .replace(/\[([^\]]+)\]/g, (_, inner) => (/[1-5]/.test(inner) ? ` ${tonePhrase(inner)}` : inner))
    .replace(/\s+/g, " ")
    .trim();
}

function tonePhrase(pinyin) {
  return pinyin
    .split(/\s+/)
    .map((part) => toneSyllable(part))
    .join(" ");
}

async function readJsonLines(file, onRow) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    onRow(JSON.parse(line));
  }
}

async function readUnihan(file, onField) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [code, field, value] = line.split("\t");
    if (!code || !field || !value) continue;
    const point = Number.parseInt(code.slice(2), 16);
    if (!Number.isFinite(point)) continue;
    const char = String.fromCodePoint(point);
    if (!seenChar.has(char)) continue;
    onField(char, field, value);
  }
}

async function readCedict(file, onEntry) {
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/);
    if (!match) continue;
    const simplified = match[2];
    const meaning = cleanGloss(match[4].split("/")[0]);
    onEntry({
      simplified,
      pinyin: tonePhrase(match[3]),
      meaning,
      hsk: hskWordLevel.get(simplified) ?? null,
    });
  }
}
