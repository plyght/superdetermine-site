import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MARK_PATH, MARK_VIEWBOX } from "../src/brand";

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const root = join(import.meta.dir, "..");

const INK = "#0a0a0a";
const FG = "#ffffff";
const MUTED = "#ffffff80";
const GREEN = "#3ddc84";
const RED = "#ff5f52";
const AMBER = "#f5b544";

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
    { headers: { "User-Agent": "curl/8" } },
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error(`no font url for ${family} ${weight}`);
  return fetch(url).then((r) => r.arrayBuffer());
}

const [interSemibold, interRegular, mono] = await Promise.all([
  loadGoogleFont("Inter", 600),
  loadGoogleFont("Inter", 400),
  loadGoogleFont("JetBrains Mono", 400),
]);

/**
 * The strip along the bottom is the moment field from the site: a run of
 * captured states that grades green until the one that broke, and stays red
 * after it.
 */
const FIELD_COLS = 60;
const BREAK_COL = 47;

function verdictColor(col: number): string {
  if (col === BREAK_COL) return RED;
  if (col > BREAK_COL) return col % 4 === 2 ? AMBER : RED;
  return col % 7 === 5 ? AMBER : GREEN;
}

const svg = await satori(
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: INK,
      color: FG,
      overflow: "hidden",
    }}
  >
    <div
      style={{ display: "flex", alignItems: "center", gap: "15px", padding: "60px 72px 0 72px" }}
    >
      <svg width={44} height={44} viewBox={MARK_VIEWBOX}>
        <path d={MARK_PATH} fill={FG} fillRule="evenodd" />
      </svg>
      <span
        style={{
          fontFamily: "Inter",
          fontSize: "34px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        superdetermine
      </span>
    </div>

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        gap: "14px",
        padding: "0 72px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter",
          fontSize: "74px",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          lineHeight: 1.08,
        }}
      >
        <span>Rewind to the last state of</span>
        <span style={{ display: "flex" }}>
          {/* satori lays sibling spans out with no gap, so the word space has to be a margin. */}
          <span style={{ marginRight: "0.26em" }}>your code that</span>
          <span style={{ color: GREEN }}>actually passed.</span>
        </span>
      </div>
      <span style={{ fontFamily: "JetBrains Mono", fontSize: "23px", color: MUTED }}>
        sdt green · version control that records what worked
      </span>
    </div>

    <div style={{ display: "flex", gap: "4px", padding: "0 72px 56px 72px" }}>
      {Array.from({ length: FIELD_COLS }, (_, col) => (
        <div
          key={col}
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "2px",
            backgroundColor: verdictColor(col),
            opacity: col === BREAK_COL ? 1 : 0.72,
          }}
        />
      ))}
    </div>
  </div>,
  {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Inter", data: interSemibold, weight: 600, style: "normal" },
      { name: "Inter", data: interRegular, weight: 400, style: "normal" },
      { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
    ],
  },
);

const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH * SCALE } }).render().asPng();

const outDir = join(root, "public/og");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "superdetermine-og.png");
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.byteLength} bytes)`);
