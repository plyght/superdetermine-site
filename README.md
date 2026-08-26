# superdetermine.com

The marketing site for [`sdt`](https://github.com/plyght/superdetermine), a version
control system that records which states of your code actually worked.

Astro, Tailwind v4, static output.

## Develop

```sh
bun install
bun run dev
```

## Gates

```sh
bun run check      # format:check + typecheck + build
```

## The OG image

`public/og/superdetermine-og.png` is generated, not drawn. Regenerate it after
changing the mark or the headline:

```sh
bun run og
```

## The mark

`src/brand.ts` is the only place the logo path lives. The nav, the hero, the
closing watermark and the OG image all read from it. To re-sync after the brand
changes, copy the `d` attribute out of `superdetermine/brand/logo.svg` into
`MARK_PATH`, then run `bun run og`.

`public/favicon.svg` holds its own copy, because it has to stand alone.

## Conventions

See [AGENTS.md](AGENTS.md). The short version: reveals animate blur and opacity
and never position, colours only ever come from the tokens in `global.css`,
icons come from lucide via `astro-icon`, and there are no em dashes.
