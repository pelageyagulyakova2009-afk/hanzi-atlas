import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
export const rawDir = path.join(here, "raw");

const HSK_BASE = "https://raw.githubusercontent.com/leonsilicon/hsk2.0/main";
const HANZI_BASE = "https://raw.githubusercontent.com/skishore/makemeahanzi/master";
const CEDICT_URL =
  "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
const UNIHAN_ZIP = "https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip";

/** Files the build reads. Names match what upstream publishes. */
export const sources = [
  ...[1, 2, 3, 4, 5, 6].flatMap((level) => [
    {
      name: `HSK2.0_chars_level${level}.json`,
      url: `${HSK_BASE}/HSK2.0_chars_level${level}.json`,
    },
    {
      name: `HSK2.0_words_level${level}.json`,
      url: `${HSK_BASE}/HSK2.0_words_level${level}.json`,
    },
  ]),
  { name: "dictionary.txt", url: `${HANZI_BASE}/dictionary.txt` },
  { name: "graphics.txt", url: `${HANZI_BASE}/graphics.txt` },
  { name: "cedict.txt.gz", url: CEDICT_URL },
];

async function exists(file) {
  try {
    const info = await stat(file);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const response = await fetch(url, {
    headers: { "User-Agent": "hanzi-atlas-build" },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

/**
 * Download anything missing into scripts/raw/. Unihan is published as one zip;
 * only the two tables the atlas needs are unpacked.
 */
export async function ensureRaw() {
  await mkdir(rawDir, { recursive: true });

  for (const source of sources) {
    const dest = path.join(rawDir, source.name);
    if (await exists(dest)) continue;
    process.stdout.write(`fetch ${source.name}\n`);
    await download(source.url, dest);
  }

  const readings = path.join(rawDir, "Unihan_Readings.txt");
  const radicalCounts = path.join(rawDir, "Unihan_RadicalStrokeCounts.txt");
  if ((await exists(readings)) && (await exists(radicalCounts))) return;

  const zip = path.join(rawDir, "Unihan.zip");
  if (!(await exists(zip))) {
    process.stdout.write("fetch Unihan.zip\n");
    await download(UNIHAN_ZIP, zip);
  }
  process.stdout.write("unpack Unihan tables\n");
  await execFileAsync("unzip", [
    "-j",
    "-o",
    zip,
    "Unihan_Readings.txt",
    "Unihan_RadicalStrokeCounts.txt",
    "-d",
    rawDir,
  ]);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  await ensureRaw();
}
