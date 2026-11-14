# UI redesign plan: "Load-Bearing Motion"

Based on `AUDIT.md`. Nothing here is built yet. Routes, API calls, data shapes and auth logic do not change.

## Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Where the landing page lives.** The app has no landing page; `/` is the project feed. | Show the landing sections ("The Span" hero and "How it works") on `/` for Guests only, above the feed they see today. Signed-in users get the feed directly. No route is added or changed. |
| 2 | **Brand colour.** The current identity is navy and teal, from your proposal. The brief asks for one strong signal accent that is not blue or purple. | Keep navy as the "ink". Replace teal as the accent with **International Orange**, the colour bridges such as the Golden Gate are painted in. Teal goes. Tell me if the proposal's teal must stay. |
| 3 | **Where the work is committed.** The brief says commit per phase; your standing rule is that nothing goes to `master` before you have seen it on localhost. | A branch, `ui-redesign`. I commit there after each phase, you review on localhost, and it is merged to `master` only when you say so. |
| 4 | **Toasts.** There are none; "Saved" and "Link copied" show as inline text. | Add a toast for short success messages. Errors stay inline next to what caused them. |
| 5 | **Smooth scrolling.** The brief allows it on landing pages only. | Leave it out. Native scrolling with ScrollTrigger scrub and pin gives the same choreography with less risk to accessibility and performance. It can be added later. |
| 6 | **The two unapplied migrations** (AUDIT section 5). | Apply them now. Search suggestions and the Account profile need them, and I cannot check those screens until they are in. |

One more thing to arrange: this rewrites most of `styles.css` and touches every component. Anyone else changing client files in the same weeks will get merge conflicts. Please tell Riyad and Rakibul, and agree who works on the client while this is in progress.

## Design system

**Concept.** Two banks and a span. Student-side things (projects, teams, uploads) sit on a cool neutral; industry-side things (professionals, offers, reviews) sit on a warm neutral. The accent appears only where the two sides connect: contact requests, conversations, likes, comments, offers applied to, invitations accepted.

**Colour tokens** (final values are tuned for contrast in Phase 1)

| Token | Light ("paper") | Dark ("ink") | Use |
|---|---|---|---|
| `--ink` | `#0B1D2E` | `#06121D` | Landing background, primary text on paper |
| `--paper` | `#F6F3EC` | `#0E2233` | App background |
| `--surface` | `#FFFDF8` | `#132B40` | Cards, panels |
| `--line` | ink at 14% | paper at 16% | Hairlines, grid |
| `--bank-student` | `#E8EEF2` | `#17344B` | Student-side tint |
| `--bank-industry` | `#F3EADB` | `#3A2E21` | Industry-side tint |
| `--signal` | `#F04E23` | `#FF6A3D` | Connections only: fills, strokes, the cable |
| `--signal-text` | `#B5360F` | `#FF8A63` | Accent text and links, meeting 4.5:1 |
| `--ok`, `--warn`, `--danger` | green, amber, red | lighter steps | Status only, never decoration |

Dark mode is a designed palette with its own surfaces, following the system setting with a toggle in the nav bar that remembers the choice.

**Type** (Google Fonts, the host already in use)
- Display: **Big Shoulders Display**, a condensed face drawn from civic and structural signage, for hero and page titles only.
- UI: **IBM Plex Sans** for everything read or clicked.
- Annotations: **IBM Plex Mono** for the small labels (`SPAN 01 / EXPLORE`, step numbers, counts).
- One modular scale of 8 steps, fluid with `clamp()`, replacing the 31 sizes in use.

**Other tokens.** Spacing on a 4/8 base (4, 8, 12, 16, 24, 32, 48, 64, 96). Three radii (2, 6, 12 px) plus pill. Two shadows. A z-index scale. Four breakpoints: 375, 768, 1280, 1536. Motion tokens in both CSS and `src/motion/tokens.ts`.

**Texture.** A quiet 12-column grid overlay and hairline rules on landing and page headers; a light grain on ink surfaces. No glass, no gradient blobs.

**Icons.** One set of 1.5 px line icons as SVG components, replacing the emoji and text glyphs.

**CSS structure.** Still plain CSS, split into files imported in order: `tokens.css`, `base.css`, `primitives.css`, then one file per page area. The old `styles.css` shrinks as each area moves over and is deleted at the end.

## Motion layer (Phase 1)

```
src/lib/gsap.ts          registers ScrollTrigger, Flip, SplitText, DrawSVGPlugin once
src/motion/tokens.ts     durations, eases, staggers
src/motion/hooks/        useReveal, useStaggerList, useFlipList, useCountUp,
                         useMagnetic, useSplitHeadline, useExitTransition
src/motion/components/   <Reveal>, <DrawLine>, <PageTransition>, <AnimatedNumber>
```

Rules built into the layer, so pages cannot get them wrong:
- Every hook uses `useGSAP()` with a scope ref; handlers go through `contextSafe`.
- One `gsap.matchMedia()` setup covers breakpoints, pointer type and `prefers-reduced-motion`. With reduced motion, movement becomes a short opacity fade and scrub and pin are off.
- Only `transform`, `opacity` and SVG stroke properties are animated.
- Content is visible by default. Animations start from the visible state being set by script, so if the script fails the page still reads.
- `useStaggerList` remembers which ids it has shown and animates only new ones.
- `useFlipList` exposes `capture()`, called just before the list state changes. That one call is the only line added inside existing data code.
- `useExitTransition` lets a dialog or toast finish its exit before React unmounts it.
- `<PageTransition>` is an overlay keyed on the location. The hairline sweeps while the new route is already mounted underneath, so back and forward and the browser's own scroll restoration keep working. ScrollTriggers are killed on route change and refreshed after images and data load.

## Page by page

| Page | Changes | Hero moment |
|---|---|---|
| **Landing (Guests on `/`)** | Ink background. "The Span": an SVG bridge draws on load; student and industry node clusters sit on each bank; scrolling connects matching nodes; headline splits in by masked lines, with the full text kept for screen readers. Then "How it works", pinned, 4 steps (Post a project → Get reviewed and published → Connect → Collaborate), each redrawing part of the diagram. Then the existing feed and Guest limit prompt. The scene is lazy-loaded. | The Span |
| **Explore (signed in)** | Paper background, annotated page header, sidebar on hairlines, blueprint skeletons, cards enter in batches, Flip reflow when filters change, result total counts up, suggestions dropdown gets enter and exit. Card covers get fixed aspect ratios. | None; quiet |
| **Project page** | Header as a title block with mono annotations; gallery, bulletin and story restyled; the bulletin's stage track and pie draw in when scrolled to and its numbers count up; like button gets a connection pulse; comments enter one by one. | The bulletin drawing in |
| **Sign in, register, forgot, reset** | Split layout: form on paper, a still slice of the bridge drawing on ink. Focus line draws under inputs, errors slide in, the submit button morphs from loading to success. | Button success |
| **Requests** | Proper tabs. Request cards show sender and recipient as two nodes. | **Match made**: on Accept, a line shoots between the two avatars and locks with a pulse. |
| **Messages** | Two-pane layout on hairlines; messages dock in from their own side; messages that arrive by polling get a highlight sweep and are announced politely. | None |
| **Notifications** | Timeline on a rule; unread items carry the signal mark; new ones sweep in. | None |
| **My projects** | Status as annotated rows; invitations as connection cards; designed empty state. | None |
| **Editor, Manage, Offers** | Form primitives throughout; sections numbered like drawing sheets; upload tiles with outline progress. | None |
| **Account** | Profile as a title block; role request as a connection in waiting. | None |
| **Admin** | Queues as a dense, calm work surface with count-up totals, tabs and consistent decision dialogs. Lazy-loaded. | None |
| **Not found, empty and error states** | Line illustrations in the same drawing language, each with a small idle animation and a next action. | None |

## Phases

Each phase ends with `npm run build`, the typecheck with unused-code checks, a short summary, and a commit on the `ui-redesign` branch. I stop for your review after each one.

| Phase | What | Rough size |
|---|---|---|
| 1 | Tokens, fonts, dark mode base, GSAP setup, motion layer, icon set | Medium |
| 2 | Primitives: Button, Input, Card, Badge, Avatar, Modal, Tabs, Toast, Skeleton, EmptyState, each with hover, focus, active, disabled and loading states | Medium |
| 3 | Landing: The Span, How it works, nav bar | Large |
| 4 | Auth pages | Small |
| 5 | App pages, in this order: Explore, Project page, Requests and Messages, Notifications and My projects, Editor, Manage and Offers, Account, Admin | Largest; I will split it into 3 or 4 reviews |
| 6 | Polish: spacing and alignment pass, dark mode pass, 375, 768, 1280 and 1536 widths | Medium |
| 7 | Verification: every route in a real browser at mobile and desktop widths, reduced motion emulated, fast route switching checked for leaked ScrollTriggers, keyboard pass, Lighthouse on a production build, and a list of anything unfinished | Medium |

This is about 47 source files and 2,400 lines of CSS, so it spans several working sessions.

## What will not change

- Route paths, API calls, request and response shapes, auth and permission logic, and everything in `server/`.
- No component is deleted without telling you first; each is replaced in place.
- The server's 1,000-plus automated tests are unaffected and are re-run at the end as a safety check.

## Risks

- **Lighthouse targets (Performance 90 on landing, Accessibility 95 everywhere)** are goals I will measure, not promises. The landing score depends mostly on the hero scene being lazy and the fonts being limited to the weights used.
- **The Supabase connection** still stalls at times, which slows browser checking and can make a page look broken when it is the database.
- **Merge conflicts** with teammates' client work, as noted above.
