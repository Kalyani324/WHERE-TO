# WHERE TO?

A phone party game that settles a group trip. Anyone proposes a destination plan, everyone plays quick mini-games that measure what the group wants, plans earn points, get edited live, the weakest are eliminated, and a secret final vote picks the winner with a Trip Reality Check card.

- React + Vite + TypeScript (mobile-first, plus a landscape board view on laptops)
- Firebase Realtime Database (anonymous auth, private paths locked by rules)
- One Vercel serverless function (`api/game.ts`) for scoring, phase changes and AI
- Google Gemini `gemini-2.5-flash-lite` behind one wrapper (`api/_lib/ai.ts` + `api/_lib/provider.ts`)
- All scoring, Fit, elimination, entry and tie-break logic is pure code in `src/engine` (no DB, no AI). Section 15 of the spec is `src/engine/__tests__/workedExample.test.ts`.

Free tiers only: Firebase Spark, Vercel Hobby, Gemini free tier.

## Project layout

```
src/engine/      pure game logic + tests
src/shared/      timers, Quick Mode rules, shared room types
src/lib/         Firebase client, API client, realtime hooks
src/ui/          design system (tokens in src/styles/tokens.css) and plan/Fit views
src/screens/     Home, Lobby, quiz/proposals (Setup), rounds and reveal (Rounds)
api/game.ts      the only HTTP endpoint (POST {op, code, ...}) with Firebase ID-token auth
api/_lib/        flow (state machine), ops, AI wrapper/queue, fallbacks, sample plans
database.rules.json   RTDB security rules
scripts/         local API server, smoke test (full game), screenshot script
```

## Local setup

Requirements: Node 20+ and Java 21+ (for the Firebase emulator).

```bash
npm install
cp .env.example .env.local      # then set VITE_USE_EMULATOR=1 (already the default for local)
```

Run three terminals:

```bash
npm run emulators   # Firebase Auth + RTDB emulator (127.0.0.1:9099 / 9000)
npm run api         # local stand-in for the Vercel function on :3001
npm run dev         # Vite on :5173 (proxies /api to :3001)
```

Without `GEMINI_API_KEY` (or with `AI_MOCK=1`) the server uses mock and pre-written fallback content, so everything works offline.

Checks:

```bash
npm test            # engine unit tests (section 15 worked example)
npm run typecheck
npm run lint
npx tsx scripts/smoke.ts 2   # plays a whole Quick Mode game: 3 real clients + 2 bots, checks private paths
```

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | client (public) | Firebase web config |
| `VITE_USE_EMULATOR` | client | `1` = talk to the local emulator |
| `GEMINI_API_KEY` | server (secret) | Gemini API key. Never sent to the client |
| `GEMINI_MODEL` | server | defaults to `gemini-2.5-flash-lite` |
| `FIREBASE_SERVICE_ACCOUNT` | server (secret) | service-account JSON (raw or base64) |
| `FIREBASE_DATABASE_URL` | server | e.g. `https://<project>-default-rtdb.<region>.firebasedatabase.app` |
| `AI_MOCK` | server | `1` = never call Gemini |
| `AI_RPM` | server | global AI requests per minute (default 8) |

## Bot demo (testing alone)

Open the app with `?bots=1`, e.g. `http://localhost:5173/?bots=1` or `https://<your-app>.vercel.app/?bots=1`. Create a room (Quick Mode is the default). In the lobby the host sees **Add bots**: choose how many (up to 10 players total) and press Start. Bots answer the quiz, two of them propose sample plans, and they tap, keep/skip and vote at random. Bots never appear on normal links, and the button is never shown without `?bots=1`.

## Deploy

### Firebase (Spark plan)
1. Create a project at https://console.firebase.google.com.
2. Build → Authentication → Get started → enable **Anonymous**.
3. Build → Realtime Database → Create database (locked mode).
4. Deploy the rules: `npx firebase login && npx firebase deploy --only database --project <project-id>`.
5. Project settings → General → Add web app → copy the config into the `VITE_FIREBASE_*` variables.
6. Project settings → Service accounts → Generate new private key → use as `FIREBASE_SERVICE_ACCOUNT`.

### Vercel (Hobby plan)
1. `npx vercel link` (or import the repo in the Vercel dashboard; framework preset: Vite).
2. Add every variable from the table above in Project → Settings → Environment Variables (leave `VITE_USE_EMULATOR` unset).
3. `npx vercel deploy --prod`.

Then open the production URL on each phone, create a room on one, and join with the 4-letter code or the QR.

## How the realtime game works

- Every player writes only their own inputs (`inputs/{step}/{uid}` with a server timestamp) and a public "locked in" flag. Rules block all reads of inputs, quiz answers, passports and drafts.
- The host's phone drives the clock: when a step's stored `endsAt` passes or everyone is locked in, it calls `advance`. The server checks the step, takes a short transaction lock, scores with the pure engine and publishes only aggregates. Any other phone takes over if the host stalls, and the longest-connected player becomes host if the host leaves.
- Fewer than 3 connected players pauses the timer; it resumes automatically.
- See `ASSUMPTIONS.md` for the choices made where the spec was open.
