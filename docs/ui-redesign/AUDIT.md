# UI redesign audit (Phase 0)

Audited on 14 November 2026 at commit `168378e` (master, after the search-suggestions pull request). No code was changed for this audit.

## 1. What the frontend is

| Area | What is there | Consequence for the redesign |
|---|---|---|
| Framework | React 19.1, Vite 7, TypeScript 5.9 (strict), `StrictMode` on | As the brief assumed. Effects run twice in development, so every animation must clean up. |
| Router | `react-router` 7.9 in declarative mode: `<BrowserRouter>` with one `<Routes>` block in `client/src/App.tsx` | No data router, so no `<ScrollRestoration>` and no route loaders. Page transitions must be an overlay that never delays the new route. |
| Styling | Plain CSS in one file, `client/src/styles.css` (2,363 lines, 36 sections), with CSS variables in `:root` | Keep plain CSS and CSS variables. No Tailwind, CSS Modules or CSS-in-JS will be added. |
| Data | Plain `fetch` through `api()` and `upload()` in `client/src/api.ts`; each page keeps its own `useState` | No query cache. "Animate only new items" has to be done by remembering ids in a hook. |
| Global state | One React Context, `AuthContext` (user, loading, login, logout, refresh) | Unchanged. |
| Animation | None. 4 CSS `transition` rules and 1 `@keyframes` (skeleton shimmer) | GSAP and `@gsap/react` are new dependencies. |
| Fonts | Inter 400–700 from Google Fonts | Replaced by the new type system. |
| Build and checks | `npm run build` = `tsc --noEmit && vite build`. There is no linter and there are no client tests | "Lint" in each phase means the typecheck, with `--noUnusedLocals`. |
| Bundle | One JavaScript bundle, about 360 kB (108 kB gzipped), no code splitting | The hero scene and the Admin and editor pages should be lazy-loaded. |
| Dark mode | None | Must be designed from scratch. |

GSAP check: `gsap` 3.15.1 ships ScrollTrigger, Flip, SplitText, DrawSVGPlugin, MorphSVGPlugin, ScrollSmoother and Observer in the public package under GSAP's no-charge licence. `@gsap/react` 2.1.2 supports React 17 and later.

## 2. Routes and their components

Route paths stay exactly as they are.

| Route | Page | Access | Main components |
|---|---|---|---|
| `/` | `Explore` | Everyone; Guests get 20 projects | Hero text, `FilterSidebar` (name search with suggestions, tag tick-list), `ProjectCard` grid, `CardSkeleton`, `GuestCapPrompt`, "Load more" |
| `/login` | `Login` | Public | `AuthLayout`, `FormField`, `GoogleSignInButton`, `Alert` |
| `/register` | `Register` | Public | `AuthLayout`, `FormField` with password rules, `GoogleSignInButton` |
| `/forgot-password` | `ForgotPassword` | Public | `AuthLayout`, `FormField` |
| `/reset-password` | `ResetPassword` | Public (token in the link) | `AuthLayout`, `FormField` with password rules |
| `/projects/:id` | `ProjectPage` | Everyone; fields depend on role | `ProjectView`: header and actions, `ScreenshotGallery`, `ProjectBulletin`, `ProjectStory`, paid offers, `Engagement` (like, comments), progress, team, `ContactButton`, `ReportButton`, share links |
| `/my-projects` | `MyProjects` | Signed in | Project list with status badges, invitations, `ConfirmDeleteDialog` |
| `/projects/new`, `/projects/:id/edit` | `ProjectEditor` | Signed in | Long form, `TagInput`, cover and screenshot upload, submit for review |
| `/projects/:id/preview` | `ProjectPreview` | Team | `ProjectView` |
| `/projects/:id/manage` | `ProjectManage` | Team | `ProjectBulletin`, milestone, progress and team forms |
| `/requests` | `Requests` | Signed in | Received / Sent switch, request cards, accept, decline, withdraw |
| `/messages`, `/messages/:id` | `Messages` | Signed in | Conversation list, message thread, composer, `ReportButton` |
| `/offers` | `Offers` | Professionals | Offer form, own offers list |
| `/notifications` | `Notifications` | Signed in | Notification list, mark read |
| `/account` | `Account` | Signed in | Profile cover, details, password, activity, uploaded projects, Professional role request |
| `/admin` | `AdminArea` | Server decides | Access card, `ReviewQueue`, `ReportQueue`, `OfferQueue`, `RoleRequestQueue`, `RemovedProjects`, `UserAccess` |
| `*` | `NotFound` | Everyone | Message and link |

Always present: `NavBar` (links by role, "New project", notification bell with unread count, account, sign out) and a skip link.

### What the brief expects that does not exist

| In the brief | In the app today | What I propose |
|---|---|---|
| A landing / marketing page | None. `/` is the project feed | Show the landing sections on `/` for Guests, above the feed. Signed-in users go straight to the feed. Needs your decision (PLAN, decision 1). |
| A dashboard with KPIs | None | Do not invent one. Count-up numbers go where real numbers exist (see section 3). |
| Matches, applications, endorsements, match scores | None. The real "connections" are contact requests, conversations, likes, comments, offers, team invitations and role approvals | The "match made" moment plays when a contact request is accepted, which is the point where a student and a professional are joined. |
| Profile pages for other people | None; only your own `/account` | Out of scope. |
| Toasts | None; success and error both show as inline alerts | Add a toast for short success messages; keep errors inline. Decision 4. |
| Tables | None | No Table primitive will be built. |
| Real-time updates | Polling only: messages every 15 s, unread count every 60 s | The highlight sweep plays on items that arrive by polling. |

## 3. Where dynamic content appears

| Kind | Where | Today |
|---|---|---|
| Fetched lists | Explore feed and search (`/projects/feed`, `/projects/search`), tags, suggestions, My projects, invitations, requests, conversations, messages, notifications, own offers, comments, milestones, progress, team, Admin queues (reviews, reports, offers, role requests, removed projects, users, audit history) | Rendered at once with no entrance. Lists re-render wholesale after every change. |
| Pagination | Explore ("Load more"), notifications, messages ("Load older") | New items are appended with no animation. |
| Filtering and search | Explore: name search, suggestion dropdown, tag tick-list. Each change refetches from the server | The grid swaps instantly. |
| Loading states | Explore has card skeletons. Everything else shows the text "Loading…" | Layout jumps when content arrives on most pages. |
| Empty states | About 15 places, each a sentence of grey text in a card | No illustration, no next action in most. |
| Error states | Inline red `Alert` or field errors | Consistent, plain. |
| Dialogs | 4 native `<dialog>`s: `TextDialog` (report, contact, Admin reasons, role request), `ConfirmDeleteDialog`, screenshot lightbox, bulletin Present mode | They open and close instantly. Native dialogs already trap focus and close on Escape. |
| Dropdown | Search suggestions (`role="listbox"`) | Appears instantly. |
| Forms | Sign-in, register, forgot and reset password, project editor, offer form, comment box, message composer, milestone, progress and invite forms, bulletin edit mode | No focus treatment beyond the outline; errors appear instantly; submit buttons change text only. |
| Numbers | Bulletin completion % and milestone counts, like and comment counts, search result total, unread count, Guest "20 projects" counter, Admin queue counts | Static. |
| Polling | Message thread (15 s), unread badge (60 s) | New items appear with a jump. |
| Uploads | Cover and screenshots in the editor and Account | A busy state on the button only. |

## 4. Design problems found

**Type**
- 31 different `font-size` values (for example 0.82, 0.83, 0.84, 0.85, 0.88, 0.9, 0.92, 0.95 rem). There is no type scale.
- One typeface, Inter, at every level. Headings differ from body text mostly by weight.
- Only 3 sizes are fluid; the rest are fixed.

**Spacing and shape**
- 21 different pixel spacings, including off-grid values (3, 5, 9, 14, 18, 28 px). No 4/8 base.
- 11 different corner radii, 4 of them written as raw pixels beside the radius tokens.
- 39 inline `style={{…}}` props carry layout that belongs in CSS.

**Colour**
- Tokens exist, but 25 hex literals sit outside them in the CSS and 12 more are in components (avatar colours, card cover gradients, the logo).
- No dark mode and no `color-scheme`.
- The accent (teal) is used for links, buttons, badges, focus states and decoration alike, so it signals nothing in particular.

**Components**
- 5 breakpoints (480, 640, 720, 860, 861 px) with no shared definition.
- The stylesheet has grown by appending; one section is titled "Fixes found by clicking through the new screens". Later rules override earlier ones for the same components.
- Icons are a mix of emoji and text glyphs (🔒 💡 🔔 ♥ 💬 ▶ ✎ ✓ ✕ ← →) and a few inline SVGs. They render differently on each system.
- Buttons have hover and disabled states but no loading or success state. `btn-sm` is used 72 times, so the small size is really the default.
- The Received / Sent and Open / Confirmed / Dismissed switches use `role="tab"` with no `tabpanel` and no arrow-key support.
- Every surface is the same white card with the same border and shadow, so pages have no hierarchy.

**States and motion**
- Loading is the word "Loading…" on every data page except Explore, which has card skeletons.
- Empty states are a line of grey text.
- One reduced-motion rule, covering the skeleton only.
- No page transition, list entrance or feedback when something is saved, beyond a text change.

**Accessibility (what is already right, and the gaps)**
- Right: skip link, visible `:focus-visible` outline, labelled fields with hints and errors wired by `aria-describedby`, native dialogs, `role="status"` on loading text.
- Gaps: only one `aria-live` region; new messages and notifications are not announced; the tab pattern above; contrast is unverified for badge and muted text and must be measured against the new palette.

**Performance**
- Everything, including the Admin dashboard and the 500-line editor, is in the first bundle.
- Images in the gallery are lazy; card covers are not sized, so the feed can shift as they load.

## 5. Found on the way, outside the redesign

These need your attention whatever happens with the redesign.

1. **Two database migrations from the merged pull request are not applied to the shared database**: `20261110090000_search_suggestions` (adds a `SearchLog` table) and `20261111090000_user_profile_cover` (adds a `UserProfile` table). Both only add tables. Until they are applied, search suggestions and the Account profile and cover features are likely to fail with a server error. I have not applied them.
2. **The root `package.json` gained three dependencies in that merge**: `@supabase/ssr`, `@supabase/supabase-js` and `@projectbridge/server`. The server already has its own Supabase client, and a workspace depending on itself by version number can break `npm install` on a clean machine. Worth asking Rakibul whether they are needed.
3. **Two migrations share a timestamp** (`20261111090000_project_completion` and `20261111090000_user_profile_cover`). They apply in alphabetical order, which works here, but new migrations should use a later timestamp.
