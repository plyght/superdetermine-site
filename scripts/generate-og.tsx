import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { MARK_PATH, MARK_VIEWBOX } from "../src/brand";

/**
 * The social card is a still frame of the hero: the deep green field, the
 * headline, and a few lines of code whose superposed tokens hold their
 * alternatives at once, with one line already resolved to the value that
 * passed.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const root = join(import.meta.dir, "..");

/* These mirror the custom properties on .hero-a in
   src/styles/components/hero-field.css. Keep them in step with it. */
const BG_HI = "#0d4f2e";
const BG_MID = "#06301c";
const BG_LO = "#03160d";
const SCRIM = "#03160d99";
const INK = "#d8f5e6";
const TEAL = "#38ccdb";
const MINT = "#42e08a";
const LIME = "#ccf575";
const PASS = "#3ddc84";

const WHITE = "#ffffff";

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
    { headers: { "User-Agent": "curl/8" } },
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error(`no font url for ${family} ${weight}`);
  return fetch(url).then((r) => r.arrayBuffer());
}

const [interSemibold, mono, monoMedium] = await Promise.all([
  loadGoogleFont("Inter", 600),
  loadGoogleFont("Roboto Mono", 400),
  loadGoogleFont("Roboto Mono", 500),
]);

/**
 * A code line is plain text with at most one superposed token, written
 * `{a|b|c}` as in heroField.ts. The first value is the one in front; the rest
 * sit behind it as fainter, softer copies.
 */
type Part = string | { alts: string[]; hue: string };

/* Roboto Mono sets no programming ligatures, so `<=` stays two characters, as
   it does in the system mono the hero draws with. */
const MONO = "Roboto Mono";
const CODE_SIZE = 26;
const CODE_LINE = 58;

function Ghost({ text, hue, depth }: { text: string; hue: string; depth: number }) {
  // Each alternative behind the front value sits a little higher, fainter and
  // softer, the way the hero smears a value into an orbital of copies.
  const offset = [0, -0.72, 0.72][depth] ?? 0;
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: `${offset}em`,
    color: hue,
    opacity: [1, 0.46, 0.24][depth],
    filter: `blur(${depth * 0.6}px)`,
    whiteSpace: "pre",
  };
  return <span style={style}>{text}</span>;
}

function Superposed({ alts, hue }: { alts: string[]; hue: string }) {
  // The widest value holds the slot open; every value is drawn on top of it.
  const widest = alts.reduce((a, b) => (b.length > a.length ? b : a));
  return (
    <span style={{ position: "relative", display: "flex", whiteSpace: "pre" }}>
      <span style={{ opacity: 0, whiteSpace: "pre" }}>{widest}</span>
      {alts
        .map((text, depth) => ({ text, depth }))
        .reverse()
        .map(({ text, depth }) => (
          <Ghost key={depth} text={text} hue={hue} depth={depth} />
        ))}
      <span
        style={{
          position: "absolute",
          left: "-18px",
          right: "-18px",
          top: "-14px",
          bottom: "-14px",
          backgroundImage: `radial-gradient(closest-side, ${hue}2a 0%, transparent 100%)`,
        }}
      />
    </span>
  );
}

function CodeLine({ parts, indent = 0 }: { parts: Part[]; indent?: number }) {
  return (
    <div
      style={{
        display: "flex",
        height: `${CODE_LINE}px`,
        alignItems: "center",
        paddingLeft: `${indent}ch`,
        fontFamily: MONO,
        fontSize: `${CODE_SIZE}px`,
        color: INK,
      }}
    >
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i} style={{ opacity: 0.5, whiteSpace: "pre" }}>
            {part}
          </span>
        ) : (
          <Superposed key={i} alts={part.alts} hue={part.hue} />
        ),
      )}
    </div>
  );
}

function ResolvedLine({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        height: `${CODE_LINE}px`,
        alignItems: "center",
        gap: "16px",
        fontFamily: MONO,
        fontWeight: 500,
        fontSize: `${CODE_SIZE}px`,
        color: PASS,
        textShadow: `0 0 18px ${PASS}99`,
        whiteSpace: "pre",
      }}
    >
      <div
        style={{
          width: "12px",
          height: "12px",
          borderRadius: "999px",
          backgroundColor: PASS,
          boxShadow: `0 0 14px ${PASS}`,
          marginLeft: "-28px",
        }}
      />
      {children}
    </div>
  );
}

/** Faint fragments on the far plane, small, soft and mostly out of the way. */
const FAR: { text: string; x: number; y: number; size: number; o: number; blur: number }[] = [
  { text: "head = prev", x: 560, y: 286, size: 15, o: 0.16, blur: 1.4 },
  { text: "for (let i = 0; i < n; i++)", x: 860, y: 300, size: 14, o: 0.13, blur: 1.8 },
  { text: "return lo;", x: 1052, y: 380, size: 15, o: 0.14, blur: 1.6 },
  { text: "x ?? y", x: 520, y: 560, size: 14, o: 0.12, blur: 2 },
  { text: "await save(tree)", x: 1000, y: 590, size: 14, o: 0.12, blur: 2 },
  { text: "match ok {", x: 1090, y: 40, size: 14, o: 0.12, blur: 1.8 },
];

/* satori lays sibling spans out with no gap, so each word carries its own
   space as a margin, and the line wraps between words. */
const HEADLINE = "superdetermine is a version control system, keeping code in superposition.".split(
  " ",
);

const svg = await satori(
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      position: "relative",
      overflow: "hidden",
      backgroundColor: BG_LO,
      backgroundImage: `radial-gradient(130% 150% at 74% 30%, ${BG_HI} 0%, ${BG_MID} 46%, ${BG_LO} 100%)`,
      color: WHITE,
    }}
  >
    {/* The shade the hero lays behind its headline. */}
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        backgroundImage: `radial-gradient(62% 48% at 26% 24%, ${SCRIM} 0%, transparent 100%)`,
      }}
    />

    {/* A soft bloom of the passing colour under the resolved line. */}
    <div
      style={{
        position: "absolute",
        left: "640px",
        top: "420px",
        width: "560px",
        height: "220px",
        display: "flex",
        backgroundImage: `radial-gradient(closest-side, ${PASS}2e 0%, transparent 100%)`,
      }}
    />

    {FAR.map((f, i) => (
      <span
        key={i}
        style={{
          position: "absolute",
          left: `${f.x}px`,
          top: `${f.y}px`,
          fontFamily: MONO,
          fontSize: `${f.size}px`,
          color: INK,
          opacity: f.o,
          filter: `blur(${f.blur}px)`,
          whiteSpace: "pre",
        }}
      >
        {f.text}
      </span>
    ))}

    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px 60px 72px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          maxWidth: "1060px",
          fontFamily: "Inter",
          fontSize: "72px",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          lineHeight: 1.06,
          textShadow: "0 1px 14px rgba(0,16,8,0.6)",
        }}
      >
        {HEADLINE.map((word, i) => (
          <span
            key={i}
            style={{ marginRight: "0.24em", color: i === HEADLINE.length - 1 ? PASS : WHITE }}
          >
            {word}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
          <svg width={40} height={40} viewBox={MARK_VIEWBOX}>
            <path d={MARK_PATH} fill={WHITE} fillRule="evenodd" />
          </svg>
          <span
            style={{
              fontFamily: "Inter",
              fontSize: "32px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            superdetermine
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: "500px" }}>
          <CodeLine parts={["if (len ", { alts: [">=", ">"], hue: TEAL }, " cap) grow();"]} />
          <CodeLine parts={["const ok = check(", { alts: ["tree", "head"], hue: LIME }, ");"]} />
          <CodeLine parts={["sum ", { alts: ["+=", "-=", "*="], hue: MINT }, " w[i];"]} />
          <ResolvedLine>return lo;</ResolvedLine>
        </div>
      </div>
    </div>
  </div>,
  {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Inter", data: interSemibold, weight: 600, style: "normal" },
      { name: MONO, data: mono, weight: 400, style: "normal" },
      { name: MONO, data: monoMedium, weight: 500, style: "normal" },
    ],
  },
);

const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH * SCALE } }).render().asPng();

const outDir = join(root, "public/og");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "superdetermine-og.png");
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.byteLength} bytes)`);
