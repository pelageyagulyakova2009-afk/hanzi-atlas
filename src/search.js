const MARKS = /[̀-ͯ]/gu;

/** Tone marks and ü/v fold away so `shui` matches `shuǐ`. */
export function foldPinyin(text) {
  return text
    .toLowerCase()
    .replace(/ü/g, "u")
    .replace(/v/g, "u")
    .normalize("NFD")
    .replace(MARKS, "");
}

/**
 * @param {{ chars: { c: string, p: string, m: string }[] }} atlas
 * @param {string} raw
 * @returns {number[]}
 */
export function searchChars(atlas, raw) {
  const query = raw.trim();
  if (!query) return [];
  const folded = foldPinyin(query);
  const hits = [];
  for (let i = 0; i < atlas.chars.length; i++) {
    const sign = atlas.chars[i];
    if (sign.c.includes(query)) {
      hits.push(i);
      continue;
    }
    if (folded && foldPinyin(sign.p || "").includes(folded)) {
      hits.push(i);
      continue;
    }
    if (folded && foldPinyin(sign.m || "").includes(folded)) hits.push(i);
  }
  hits.sort((a, b) => {
    const exactA = atlas.chars[a].c === query ? 0 : 1;
    const exactB = atlas.chars[b].c === query ? 0 : 1;
    return exactA - exactB;
  });
  return hits;
}
