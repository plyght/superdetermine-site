/**
 * Copy is authored as plain strings so it stays readable in the source, which
 * means bare URLs arrive as text. This turns them into real links and gives a
 * GitHub URL the short `user/repo` label people actually recognise.
 */
export type Segment =
  { kind: "text"; value: string } | { kind: "link"; href: string; label: string };

/** Bare `github.com/...` is matched too, since the copy rarely writes the scheme. */
const URL_RE = /(https?:\/\/[^\s<>()]+|\bgithub\.com\/[^\s<>()]+)/gi;

/** A URL at the end of a sentence swallows the punctuation without this. */
const TRAILING = /[.,;:!?]+$/;

export function labelFor(href: string): string {
  const bare = href.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const github = bare.match(/^github\.com\/([^/]+)\/([^/]+)/i);
  return github ? `${github[1]}/${github[2]}` : bare;
}

export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(TRAILING, "");
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

    if (start > last) out.push({ kind: "text", value: text.slice(last, start) });
    out.push({ kind: "link", href, label: labelFor(trimmed) });

    // Whatever punctuation the URL swallowed belongs to the sentence.
    const tail = raw.slice(trimmed.length);
    if (tail) out.push({ kind: "text", value: tail });
    last = start + raw.length;
  }

  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
