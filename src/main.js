import { createSky } from "./scene.js";

const canvas = document.querySelector("#sky");
const status = document.querySelector("#status");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #sky canvas");
}

async function start() {
  try {
    const response = await fetch("/data/atlas.json");
    if (!response.ok) throw new Error(String(response.status));
    const atlas = await response.json();
    if (!Array.isArray(atlas.chars) || atlas.chars.length === 0) {
      throw new Error("empty atlas");
    }
    await createSky(canvas, atlas);
  } catch (error) {
    console.error(error);
    if (status) {
      status.hidden = false;
      status.textContent = "星图没有载入。请先生成 atlas.json。 The atlas did not load.";
    }
  }
}

start();
