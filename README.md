# BEYOND

BEYOND is a responsive dating and social-discovery prototype built around the idea that a profile is only the beginning of a connection.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Vite. Choose **Start discovering** or **Enter the demo** to explore the sample application. The demo does not need API keys, a database, or paid services.

Build and preview the static production bundle:

```powershell
npm.cmd run build
npm.cmd run preview
```

Run the matching and scoring unit tests with:

```powershell
npm.cmd test
```

## What works in the prototype

- Responsive editorial landing page, demo entry, and public about and safety pages.
- Profile editing, interest selection, image preview, and local persistence.
- Sixteen adult sample discovery profiles, intent and interest filters, pass/like actions, seeded mutual matches, profile details, and match cards.
- Six-question Personality DNA quiz with answer-derived dimension scores and a prompt with visibility choices.
- Local match conversations with message composition and persisted message history.
- Chemistry Room demo activities, with the simulated participant explicitly identified.
- Persistent demo music playlist and movie watchlist.
- Connection timeline, profile blocking, unmatching, privacy settings, and a resettable demo state.
- Slow Dating Letters: consent-aware mutual-match composition, locally saved drafts, a searchable private archive, favorites, starter stamps, optional small photo attachments, configurable simulated delivery tiers, arrival preferences, quiet hours, and an opt-in read-receipt control.
- Keyboard-visible focus, semantic form labels, responsive layouts, and reduced-motion support.

## Prototype boundary

This is a **single-browser product prototype**, not a production dating service. Demo authentication is not identity verification; profile, conversation, playlist, quiz, and letter data are stored in browser `localStorage`; the activity counterpart is a disclosed simulation. Letters and delivery timestamps are prototype state, not server-enforced or synchronized: the delivery timer only advances while the app is open or revisited, and a user can alter browser storage or the device clock. Delivery tiers are manually selected examples; the app does not collect GPS or calculate real distance. Letter photos are stored locally as data URLs. There is no backend, shared multi-user persistence, server-side authorization, real-time transport, moderation operation, or account recovery. Demo photography is loaded from Unsplash URLs and therefore requires network access.

Do not use this prototype to handle real user accounts, private conversations, precise location, or other sensitive personal information. Before a public beta, replace the local demo store with a secured API and database; calculate and persist letter delivery on the server; enforce authenticated conversation membership, mutual matches, blocks, rate limits, and pagination; add authenticated real-time updates and notification delivery; validate and scan uploads; and define letter retention, deletion, account-closure, reporting, and moderation workflows. The prototype's read-receipt preference is a UI setting only and is not a secure multi-user privacy control. No external service or environment variable is configured for Letters. Do not present compatibility heuristics as scientific predictions.

## Slow Dating Letters

The **Letters** navigation item provides a letter inbox and archive, draft autosave, an optional subject and photo, free decorative stamps, a writing prompt, favorite/delete actions, delivery status, and a settings screen for participation, conversation style, relationship intention, approximate demo tiers, in-app arrival notices, quiet hours, and read-receipt preference. Only seeded mutual matches who opted into Slow Dating are available in the prototype. The local demo's distance selector does not represent actual user location or travel distance. A real scheduled-delivery service, backend database and migrations, secure notifications, moderation/reporting, and cross-device behavior remain future backend work; no production guarantees should be inferred from this UI.

## Implementation notes

- React, TypeScript, Vite, and React Router.
- Visual design uses CSS and text labels only; it does not depend on icon libraries.
- Profile personality dimensions are demo seed values. Compatibility is a deterministic, non-clinical estimate using Jaccard interest overlap and only the Personality DNA answers the demo user has completed; missing answers are excluded and the remaining available weights are normalized.
- User-controlled demo data can be reset from **Settings & privacy**.
