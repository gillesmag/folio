# Folio for iOS — spec

A native reader for the documents pushed to your Folio account. It lists them, renders each one with the same HTML the web app shows, and lets you comment on any block so agents can pick the feedback up with `folio comments`. It does not create or edit documents; that stays with the CLI and the web app.

Status: implemented (milestones 1 to 4 below) and run in the iOS 26.5 simulator against a local server. Section 14 records what was verified and where the code departs from the original sketch.

## 1. Goals and non-goals

Goals

- Open the app and see every document you own, newest first, in under a second (cached list, background refresh).
- Read a document with the least possible chrome around it: the text is the screen.
- Comment on a block or on the whole document, resolve and reopen comments.
- Light and dark, following the system by default and overridable in Settings.
- Sign in with Google. Sessions survive app restarts and only end on sign-out or server-side expiry.
- Feel like an iOS 26 app: Liquid Glass bars and sheets, system typography, Dynamic Type, edge-to-edge content.

Non-goals for v1

- Creating, editing, or deleting documents. (Delete is a possible v1.1 swipe action.)
- Managing API keys or visibility.
- Offline writes. Reads are cached; comments need the network.
- iPad and macOS layouts. The app must run on iPad unmodified, but no split-view design yet.
- Push notifications for new documents or comments.

## 2. What the architecture gives us

Facts from the repo that shape the app.

- Rendering happens once on write in the API Worker. `GET /api/documents/:id` returns the sanitized HTML, the markdown source, and `meta` with `toc`, `hasMath`, `hasMermaid`, `blockCount`. Versions are immutable, so `(id, version)` is a safe cache key forever.
- `packages/render/src/styles.css` is written to be host-agnostic. It owns all document typography, keys off `--doc-*` tokens, and switches dark mode with a `.dark` class on an ancestor. Its header comment already names the iOS web view as a consumer.
- Math needs KaTeX CSS and fonts at display time. Mermaid diagrams are shipped as `<pre class="mermaid">` source and rendered on the client by Mermaid in strict mode. Shiki emits dual-theme tokens (`--shiki-light` / `--shiki-dark`), selected by the same `.dark` class.
- Every block carries `data-block-id`. Comments anchor to that id or to `null` for the whole document. The stylesheet already draws the selected-block highlight and the per-block comment count badge, and moves the badge to the right edge below 640 CSS px, which is every iPhone.
- The API Worker is not publicly reachable. Everything goes through the web Worker origin, which proxies `/api/*` and `/auth/*` verbatim, so the app's base URL is the web app's URL.
- Auth is Better Auth with the Google social provider, the `bearer` plugin (`Authorization: Bearer <session token>`, token handed out in a `set-auth-token` response header) and a device flow restricted to the `folio-cli` client id.
- Better Auth 1.7.4's Google provider accepts `clientId: string | string[]`. The first entry drives the web OAuth flow; the whole list is the accepted audience when a client signs in with a Google ID token via `POST /auth/sign-in/social`. That is what makes native sign-in a one-line server change.

## 3. Platform and stack

| Choice | Decision |
| --- | --- |
| Minimum OS | iOS 26. Liquid Glass and the new toolbar APIs are the point; no back-porting. |
| Language | Swift 6, strict concurrency, `@Observable` models, async/await throughout. |
| UI | SwiftUI. One `NavigationStack`, no tab bar. UIKit only for `WKWebView` and `ASWebAuthenticationSession` fallback. |
| Networking | `URLSession` with `Codable` models mirroring `packages/contract`. No networking library. |
| Dependencies | None. Google sign-in is the OAuth code flow with PKCE in an `ASWebAuthenticationSession`, which is what the SDK does underneath and saves a package resolution step. |
| Persistence | Keychain for the session token. `FileManager` cache directory for document JSON and the last list. `@AppStorage` for preferences. |
| Project | `apps/ios/Folio/Folio.xcodeproj`, one app target and one UI test target. Web assets are copied in by a build-phase script, never hand-maintained. |

## 4. Screens

Four screens plus two sheets. Every screen exists in light and dark.

### 4.1 Sign in

Shown when no session token exists or the server answered 401.

- Centered wordmark "Folio" and one line: "Documents your agents push to you."
- One primary button, "Continue with Google", `.buttonStyle(.glassProminent)`.
- Footer in secondary text: the server host, with "Change" opening an inline field. Default is the production origin baked into the app. This is what lets the same build talk to a self-hosted instance.
- Errors show inline under the button, in plain words ("Google didn't return an account. Try again.").

### 4.2 Documents

`NavigationStack` root. Large title "Folio".

- `List` of `DocumentSummary` rows sorted by `updatedAt` descending. Row: title (two lines max, `.headline`), below it relative date ("2h ago", "Yesterday", "12 Sep") and a small SF Symbol for visibility: `lock` private, `link` unlisted, `globe` public. Version and owner are not shown.
- `.searchable` filtering by title, `.searchToolbarBehavior(.minimize)` so the field lives in the bottom glass toolbar on iPhone and shrinks away when unused.
- `.refreshable` pulls the list again. Launch shows the cached list immediately, then refreshes.
- Trailing toolbar item: the user's avatar in a circle (from `User.image`, initials fallback) opening Settings as a sheet.
- Swipe actions: "Copy link" (leading). Delete is deliberately not in v1.
- Empty: `ContentUnavailableView` titled "No documents yet" with the hint `folio push report.md` in monospace.
- Error: the cached list stays visible; a small glass capsule at the bottom says "Couldn't refresh" with Retry.

### 4.3 Reader

The core screen. A full-bleed web view of the document HTML, with the least chrome that still lets you leave and act.

Chrome, all in the system navigation bar (glass on iOS 26, content scrolls underneath):

- Leading: back. Nothing else on that side.
- The title is removed from the bar (`.toolbar(removing: .title)`). The document's own h1 is the title; it should not appear twice. When the h1 has scrolled off screen and the bar is visible, the bar shows the title in small text, like Safari. This is a nice-to-have.
- Trailing, one group separated from back by `ToolbarSpacer(.flexible)`:
  - "Contents" (`list.bullet`) opens the contents sheet. Hidden when `meta.toc` has fewer than two entries after dropping a leading h1 that equals the title, mirroring the web page.
  - "Comments" (`bubble.left`) with a badge for open comments, opens the comments sheet.
  - "More" (`ellipsis`) menu: Comment on document, Share link, Open in Safari, Copy markdown.
- The bar hides on scroll down and returns on scroll up or on a tap in a non-interactive area, animated with `.toolbarVisibility`. The status bar stays. Nothing sits at the bottom of the screen except a composer while writing a comment.
- `.scrollEdgeEffectStyle(.soft, for: .top)` so text fades under the bar instead of hitting a hard line. Verify this tracks the web view's scroll view; if not, the bar keeps the default hard edge and we revisit.

Content:

- The web view is transparent (`isOpaque = false`) over the system background, so the page ground is the app ground in both themes.
- Text is selectable. Pinch zoom is allowed. Link previews are on.
- Tapping a block toggles it as the comment anchor (the `.selected` highlight from the stylesheet) and slides the composer in. Tapping it again clears the anchor.
- Blocks with open comments carry the count badge the stylesheet already draws.
- Links: `#anchor` scrolls in place. A link to another document on this server pushes a new Reader. Any other `http(s)` link opens in `SFSafariViewController`. `mailto:` and friends go to the system.

Comment composer:

- A `GlassEffectContainer` at the bottom, above the keyboard: a capsule text field ("Comment on this paragraph…" or "Comment on the document…"), and a "Post" button. It morphs out of the Comments toolbar button with `glassEffectID` when possible.
- Posting is optimistic: the badge on the block updates at once, the request goes out, failure reverts and shows the error inline.

### 4.4 Contents sheet

`meta.toc` as a list, indented by depth, with the currently visible heading emphasized. Tap scrolls smoothly to the heading and dismisses. `.presentationDetents([.medium, .large])`. Sheets get glass from the system; nothing custom.

### 4.5 Comments sheet

- Header: "Comments · n". Segmented filter Open / Resolved / All, default Open.
- Rows: body, relative date, "On a paragraph" link when anchored (jumps to the block and dismisses), "Whole document" otherwise. Resolved rows are dimmed.
- Swipe: Resolve / Reopen (author or document owner). Delete (author only) with confirmation.
- A "New comment" button at the bottom opens the composer with no anchor.

### 4.6 Settings sheet

Grouped list.

- Account: avatar, name, email. "Sign out" in red at the bottom of the group.
- Appearance: segmented picker System / Light / Dark. Applies immediately, including to an open Reader.
- Reading (v1.1): text size stepper on top of Dynamic Type.
- Server: current origin, read-only while signed in. Sign out to change it.
- About: version, "Open Folio on the web", link to the repo.

## 5. Visual language

- System typography everywhere. The document uses the stylesheet's stack, which resolves to SF on iOS. No custom fonts.
- Liquid Glass is only on the navigation layer: bars, the floating composer, sheets, buttons in bars. Never on content. List rows and the document body are flat on the system background.
- Colors come from the system: `label`, `secondaryLabel`, `separator`, `secondarySystemBackground`, and the app tint. The document tokens map onto them (section 7), so the web view and the native screens share one palette in both themes.
- Tint: the stylesheet's accent, `#2563EB` light and `#7AA2FF` dark, as the app accent color asset with a dark variant. Comments badges and the selected block use it.
- Motion: only the system's. Bar hide/show, sheet presentation, and the composer morph. No custom transitions.
- Dynamic Type: native views use text styles. The web view sets the root font size from `UIFont.preferredFont(forTextStyle: .body).pointSize` and re-applies on `UIContentSizeCategory.didChangeNotification`.
- App icon: Icon Composer layered icon (a folded sheet mark) so the system can produce the glass, dark, tinted and clear variants.

Appearance setting

```swift
enum Appearance: String, CaseIterable { case system, light, dark
  var colorScheme: ColorScheme? { self == .system ? nil : (self == .dark ? .dark : .light) } }
```

The root view applies `.preferredColorScheme(appearance.colorScheme)`. The Reader reads the resolved `colorScheme` from the environment and pushes it into the web view: `overrideUserInterfaceStyle`, the `.dark` class on `<html>`, and a Mermaid re-render with the `dark` theme when diagrams are present.

## 6. Authentication

Two paths, chosen at runtime by whether the build carries an iOS OAuth client id in `Info.plist` (`GoogleIOSClientID`).

**Default: the device flow, no server change.** With no iOS client id, `DeviceFlowAuth` runs the same RFC 8628 flow as the CLI, presenting itself as the `folio-cli` client the server already accepts. It requests a code, opens the web app's approval page in an ephemeral `ASWebAuthenticationSession` (where "Continue with Google" uses the web app's own OAuth client), polls for the token, and closes the sheet as soon as the token arrives. This is verified end to end in the simulator and needs nothing beyond the deployed server.

**Optional: native Google sign-in.** With an iOS client id configured:

1. `GoogleAuth.signIn()` opens Google's authorization endpoint in an `ASWebAuthenticationSession` (PKCE, `openid email profile`, a nonce), receives the code on the reversed-client-id scheme and exchanges it at Google's token endpoint. Result: Google ID token and access token. iOS client ids need no secret.
2. `POST {origin}/auth/sign-in/social` with body `{"provider":"google","idToken":{"token":"…","accessToken":"…"}}`. Better Auth verifies the ID token against the configured client ids and answers `{ token, user, redirect: false }` and a `set-auth-token` header.
3. Store the token in the Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, service `ai.folio.session`, account = server origin so several servers can coexist).
4. Every API request sends `Authorization: Bearer <token>`. Better Auth's bearer plugin maps it to the session, and the session's sliding expiry extends on use.
5. `GET /api/me` on launch validates the token and fills the Settings sheet. A 401 anywhere clears the token and returns to Sign in.
6. Sign out: `POST /auth/sign-out` with the bearer, then delete from the Keychain and the document cache.

The native path needs a server change that is deliberately not made here: Better Auth's Google provider must list the iOS client id as an accepted audience (`clientId: [webId, iosId]`), and Google Cloud Console needs an iOS OAuth client for the bundle id `ai.arcella.Folio`. Until then, leave `GoogleIOSClientID` empty and the device flow is used.

Native requests carry no `Origin` header, which Better Auth's trusted-origin check permits; the CLI's device flow already relies on this.

Fallback if the ID-token exchange misbehaves in practice: the RFC 8628 device flow the CLI uses, with `validateClient` extended to accept `folio-ios`, and `ASWebAuthenticationSession` opening `verification_uri_complete`. Same token storage from step 3 on.

## 7. Rendering pipeline in the app

The app never parses markdown. It wraps the server HTML in a local page and serves everything from the bundle through a `WKURLSchemeHandler` on the `folio-app` scheme, so the page has a stable origin and no file-URL permissions are needed.

Page assembled per document:

```html
<!doctype html>
<html class="{dark?}">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="folio-app://assets/folio-doc.css">
<link rel="stylesheet" href="folio-app://assets/katex/katex.min.css">   <!-- only if meta.hasMath -->
<style>/* host tokens, generated natively */
.folio-doc { --doc-fg:#…; --doc-muted:#…; --doc-border:#…; --doc-surface:#…; --doc-link:#…; --doc-accent:#…; --doc-selection:… }
html { font-size: {bodyPointSize/17 * 16}px }
body { margin: 0; padding: 0 20px calc(env(safe-area-inset-bottom) + 24px); background: transparent }
</style>
</head>
<body>
<article class="folio-doc can-comment">{html}</article>
<script src="folio-app://assets/mermaid.min.js"></script>        <!-- only if meta.hasMermaid -->
<script src="folio-app://assets/reader.js"></script>
</body></html>
```

Host tokens are resolved natively from `UIColor` for the current trait collection: `label` → `--doc-fg`, `secondaryLabel` → `--doc-muted`, `separator` → `--doc-border`, `secondarySystemBackground` → `--doc-surface`, `label` → `--doc-link`, tint → `--doc-accent`. They are regenerated and re-injected when the color scheme changes, alongside toggling `.dark` on `<html>` for the Shiki and stylesheet dark rules.

Bundled assets, copied into the built bundle's `WebAssets/` folder by `apps/ios/scripts/sync-assets.sh`, which runs as the target's last build phase (needs `pnpm install` first, and script sandboxing is off for that reason). Nothing generated is committed:

| Asset | Source | Size (approx.) |
| --- | --- | --- |
| `folio-doc.css` | `packages/render/src/styles.css` | 10 KB |
| `katex/` (css + fonts) | `node_modules/katex/dist` | 1.2 MB |
| `mermaid.min.js` | `node_modules/mermaid/dist` | 3 MB |
| `reader.js` | `apps/ios/Folio/Resources/reader.js` (hand-written) | 2 KB |

`reader.js` mirrors the web page's client behavior with the same Mermaid configuration (`securityLevel: 'strict'`, `htmlLabels: false`, forbidden tags), rendering each diagram independently and showing the source with `mermaid-failed` when one does not parse. Theme is `neutral` in light and `dark` in dark.

Bridge, over `WKScriptMessageHandler` named `folio`:

| Direction | Message | Payload |
| --- | --- | --- |
| JS → native | `ready` | document height |
| JS → native | `blockTap` | `blockId` (null clears) |
| JS → native | `heading` | active heading id from an `IntersectionObserver` |
| JS → native | `titleVisible` | whether the first h1 is on screen |
| native → JS | `folio.select(id)` | toggles `.selected` |
| native → JS | `folio.setComments({id: count})` | sets `data-comments` badges |
| native → JS | `folio.scrollTo(id)` | smooth scroll, block centered |
| native → JS | `folio.setTheme(dark, tokens)` | swaps class and tokens, re-renders Mermaid |

Web view configuration: `isOpaque = false`, clear background, `scrollView.contentInsetAdjustmentBehavior = .always`, `allowsLinkPreview = true`, `dataDetectorTypes = []`, no JavaScript from remote origins (nothing remote is loaded except document images over https).

## 8. Data layer

Models are `Codable` structs mirroring `packages/contract`: `User`, `DocumentSummary`, `Document`, `RenderMeta`, `TocEntry`, `Comment`, `Visibility`. Dates decode from ISO 8601 with fractional seconds. Errors decode the `_tag` shape (`Unauthorized`, `Forbidden`, `DocumentNotFound`, `CommentNotFound`).

`FolioClient` (actor): `me()`, `documents()`, `document(id)`, `comments(documentId)`, `createComment(documentId, blockId, body)`, `setResolved(commentId, resolved)`, `deleteComment(commentId)`, `signOut()`. One `URLSession`, bearer injected, 401 → `AuthSession.expire()`.

`DocumentCache`: `Caches/documents/<id>/<version>.json`, written on first fetch, read before the network whenever the list already knows the current version. Because the list carries `version`, opening a document you have read before never waits on the network. Old versions are pruned when a newer one lands. The last list response is stored at `Caches/list.json` for instant launch.

Comments are always fetched fresh when the Reader or the sheet appears; they are small and change often.

## 9. Deep links

The CLI prints `https://<app>/d/<id>` after every push. Those links should open the app.

- Associated Domains `applinks:<app host>` in the app, and the web Worker serving `/.well-known/apple-app-site-association` with the Team ID and bundle id (`55K4639K57.ai.arcella.Folio`) for `/d/*`. Neither is in place yet; the server side is a change outside the app.
- `onOpenURL` routes `/d/<id>` to the Reader on top of the list. Public and unlisted documents open without a session; private ones prompt sign-in first.
- Handoff from the web app to the phone comes for free once universal links exist.

## 10. Project layout

```
apps/ios/
  SPEC.md
  scripts/sync-assets.sh          # build phase: styles.css, katex, mermaid -> Folio.app/WebAssets
  Folio/
    Folio.xcodeproj               # synchronized folder; new files under Folio/ join the target
    Config/Info.plist             # URL scheme, local-network ATS exception, FolioDefaultServer, GoogleIOSClientID
    Folio/
      FolioApp.swift              # root: Appearance, AuthSession, Router, deep links
      App/          Appearance.swift, Router.swift
      Auth/         AuthSession.swift, DeviceFlowAuth.swift, GoogleAuth.swift, Keychain.swift, SignInView.swift
      API/          FolioClient.swift, Models.swift (models + APIError + JSON coders)
      Store/        DocumentCache.swift, DocumentsStore.swift
      Documents/    DocumentsView.swift (list, row, avatar, relative dates)
      Reader/       ReaderView.swift, ReaderModel.swift (state + bridge), DocumentWebView.swift,
                    ReaderPage.swift (HTML assembly), AssetSchemeHandler.swift, reader.js,
                    ContentsSheet.swift, CommentsSheet.swift, CommentComposer.swift
      Settings/     SettingsView.swift
```

`FolioUITests` (in the Folio scheme's Test action) drives the app by touch against the local servers: tap a row, scroll, tap a paragraph, post a comment, open the comments sheet, go back, open the largest document and scroll it until the bar hides and returns. Run it with `TEST_RUNNER_FOLIO_SHOTS=<dir> xcodebuild test -scheme Folio` to get screenshots of each step.

## 11. Security and privacy

- The session token lives only in the Keychain, this-device-only. No iCloud Keychain sync.
- The web view only ever loads local assets plus the server's sanitized HTML. Remote scripts are impossible because nothing links to them and the HTML is sanitized upstream. Remote images load over https only (`NSAllowsArbitraryLoads` stays off).
- `folio-app://` scheme handler serves an allowlist of bundle files; anything else is a 404.
- Cached documents are in `Caches`, excluded from backup, deleted on sign-out.
- No analytics, no crash reporter in v1.

## 12. Open questions

1. Reader bar behavior: hide on scroll (proposed) versus always visible but transparent. Hiding is more minimal; always-visible is more predictable. Decide after the first build on device.
2. Should the list show open-comment counts per document? It would need a `commentCount` field on `DocumentSummary` and one extra query in the list handler. Useful for "which doc is waiting on me", cheap to add.
3. Delete from the list in v1 or v1.1?
4. Universal links in v1 or v1.1? They need the Team ID and a deployed AASA file, so they depend on the App Store account being ready.

## 13. Milestones

1. Skeleton: project, sign-in against the local dev server, list from the API, settings with appearance. Server change for the iOS client id.
2. Reader: HTML assembly, scheme handler, tokens and theme switching, links, Contents sheet.
3. Comments: bridge, composer, sheet, resolve and delete, badges.
4. Polish: bar hide/show, title on scroll, Dynamic Type, caching, empty and error states, icon.
5. Ship: TestFlight, universal links, README section.

## 14. Implementation notes

What was verified in the iOS 26.5 simulator (iPhone 17 Pro) against `wrangler dev` and `vite dev` with a seeded session and three pushed documents, including the renderer's torture fixture (bundle id `ai.arcella.Folio`):

- Sign-in screen, document list with search and visibility symbols, Settings sheet, appearance picker.
- Reader: glass back button, grouped Contents and Comments buttons with an open-comment badge, separate More menu; content starts below the chrome and scrolls under it; Mermaid diagrams, KaTeX inline and display math, Shiki code, tables, task lists, footnotes.
- Comments: badges on commented blocks, the comments sheet with its filter, the composer with keyboard. Comments were created through the API; posting from the composer uses the same endpoint.
- Live theme switching with a document open, in both directions, including Mermaid re-rendering in the dark theme.
- Contents sheet indentation and jump targets.

Verified by touch through `FolioUITests`: tapping a row to open a document, dragging to scroll, the bar hiding while reading downwards and returning on an upward drag, tapping a paragraph to open the composer, typing and posting a comment, the new comment appearing in the sheet and as badges, going back, and opening the largest document. Two bugs that only the touch path showed were fixed on the way: WebKit resets a loaded page to offset 0 (under the chrome) after the first pin, so the coordinator re-pins until the reader scrolls; and bar toggling now reacts only to finger-driven scrolls, with a short cool-down, so inset changes cannot feed back into it.

Not exercised:
- Native Google sign-in (the optional path). It needs an iOS client id and the server-side audience change. The exchange endpoint and Better Auth's audience list were verified from source, not at runtime. The default device-flow sign-in was verified end to end: the app requested a code, opened the web sign-in page, and signed in once the code was approved.
- Universal links. Nothing is in place yet on either side.

Departures from the sketch:

- No third-party dependencies and no server changes. Sign-in defaults to the device flow as the `folio-cli` client; native PKCE sign-in is present but dormant until an iOS client id and the server-side audience change exist (section 6).
- The web view uses UIKit's own safe area (`contentInsetAdjustmentBehavior = .always`) rather than SwiftUI geometry, which reports zero insets for a representable that ignores the safe area. WebKit lands loaded pages at offset 0, so the wrapper pins the initial offset to the adjusted inset.
- `Info.plist` lives in `Config/`, outside the synchronized folder, otherwise Xcode also copies it as a resource.
- Debug builds understand launch environment `FOLIO_SERVER` and `FOLIO_TOKEN`, the launch argument `--open <url>`, and the routes `folio://settings`, `folio://signin`, `folio://signout` and `folio://d/<id>?sheet=contents|comments|compose`. They exist to drive the simulator and are compiled out of release builds.
- The comments sheet puts the Open / Resolved / All picker where the title would be; the count lives on the toolbar badge instead.

