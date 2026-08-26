# superdetermine.com

The marketing site for `sdt` (superdetermine). Astro 7, Tailwind v4, static output,
deployed on Vercel.

## Commands

Use Bun. Never npm, yarn, or pnpm.

```
bun install
bun run dev          # local dev server
bun run build        # static build to dist/
bun run og           # regenerate public/og/superdetermine-og.png
bun run check        # format:check + typecheck + build
```

`bun run check` is the gate. Run it before you call anything done.

## Structure

One page. `src/pages/index.astro` composes every section; `/privacy` and `/terms`
are the only other routes.

- `src/brand.ts` holds the mark path. It is the single source for the logo, the
  closing watermark, and the OG image. Re-sync it from `superdetermine/brand/logo.svg`.
- `src/styles/global.css` holds the design tokens and the shared reveal keyframes.
- `src/styles/components/*.css` is one file per component.

## Positioning

`sdt` **is its own version control system.** It is not a git extension, a plugin,
a wrapper, or a layer that adds one feature to git. It has its own object store,
its own history model, and its own commands.

So when the question is "does this replace git", the answer is **yes, it is a
separate VCS**. What makes adopting it safe is not that it is somehow still git
underneath, it is that the git interop is bidirectional and lossless: full
history, branches and tags move both ways, and `sdt export <dir>` writes a plain
git repo whenever you want one. Adoption is reversible because of interop, not
because sdt is a subordinate part of a git workflow.

Running beside an existing `.git` is a real and supported path, but it is a
migration and coexistence story, not what the product is. Copy that leads with
"it runs beside git" or "it does not replace git" undersells it and reads as
though continuous capture and grading were features bolted onto git. Do not
write it that way.

Still be fair to git, and never claim sdt is finished: it is early and
opinionated and interfaces may still change.

## The idiom

This site is built on a very specific card language. Every section obeys it.
Deviating from it is the single easiest way to make the site look wrong, so if
you are adding or rebuilding a component, copy this shape rather than inventing
one.

A card is a flat surface with a big heading, one short line, and a large mostly
wordless visual that fills the rest:

```astro
<article class="relative flex min-h-[273px] flex-col overflow-hidden rounded-card bg-surface p-6">
  <header class="max-w-[440px] pb-4">
    <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-white sm:text-[32px]">
      Heading
    </h2>
    <p class="mt-2 text-[14px] leading-[1.35] tracking-[-0.01em] text-muted">
      One sentence. Twenty words at the absolute most.
    </p>
  </header>

  <div class="mt-auto">
    <!-- the visual, given room to breathe -->
  </div>
</article>
```

Hard rules:

- **The visual carries the idea, not the prose.** If a component needs a
  paragraph to explain itself, the visual is wrong. One short sentence under the
  heading, and nothing else. No second paragraph, no footnote, no caption
  explaining the visual.
- **No eyebrows or kickers.** Never a small uppercase or mono label above a
  heading. The heading starts the section.
- **Type sits on one scale.** 13px for nav and footer meta only, 14px body, 15px
  emphasised body, 16px a strong label or small heading, 20px a display value,
  28px a card heading rising to 32px at `sm`. 14px is the floor for body text and
  nothing goes below it. If a new size feels necessary, one of these is almost
  always right instead: a 1px difference reads as a mistake, not as intent.
- **No tables, no receipts, no terminal transcripts, no log dumps.** These read
  as documentation, not as a product page.
- **Mono is for short inline command names only**, like `sdt green`. Never for
  prose, never for a paragraph, never for a wall of output.
- **Surfaces are flat.** `bg-surface` on `--color-ink`. No inner panels with
  borders, no nested cards, no boxes inside boxes, no hairline frames around
  content.
- Sections are separated by the `gap-4` on `<main>` and nothing else. No rules,
  no dividers.

## Rules

- **Motion resolves focus, never position.** Reveals animate `opacity` and
  `filter: blur()` only. Nothing slides or translates into place. The shared curve
  is `var(--ease-reveal)`. Wrap motion in `@media (prefers-reduced-motion: no-preference)`
  and make sure the reduced-motion path renders the finished state.
- **Never hardcode a colour.** Use the tokens in `global.css`. They flip under
  `html[data-theme="light"]`, so check both themes.
- **Icons come from a library.** `astro-icon` with `@iconify-json/lucide`. Do not
  hand-write SVG path data.
- **No em dashes.** Anywhere. Use a period, a comma, or a middle dot.
- Copy is plain and declarative. Claims must match what the code in the
  `superdetermine` repo actually does, not what the README aspires to.
