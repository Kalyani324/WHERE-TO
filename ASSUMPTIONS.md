# Assumptions

Where SPEC.md was ambiguous, the simplest option was picked and noted here.

## Players and rooms
- A player's identity is a Firebase anonymous-auth uid (the "device token"). Reopening the link on the same browser rejoins as the same player.
- New players can join only in the lobby. Rejoining (same device) works at any time.
- Avatars are a choice of 10 line icons; the traveller title comes from the AI with a pre-written fallback.
- Room codes are 4 letters (no ambiguous letters like I/O).

## Entry check
- A non-Indian passport on a plan in the player's own country counts as domestic ("None", "No known requirement, check local rules"). Every other non-Indian case is Unknown (50), as the spec says.
- An Indian passport on an Indian destination that is not in the table is treated as None (100) with the message "No known requirement, check local rules".
- Worst-case order for the badge: Visa: Hard, Unknown, Visa: Medium, Visa: Easy, Permit, None (by entry score).
- Visa Guy pages exist only for some countries; others (e.g. UAE) link to the eligibility checker. `npm run check-links` verifies them.

## Scoring
- "Other proposers" (half weight) means anyone who owns any plan, including plans already eliminated.
- A Keep or Skip card with no eligible taps counts as a tie (+1).
- Taps, quiz submissions and votes stamped up to 750 ms after `endsAt` (server time) still count, to absorb network delay. Later ones are late.
- Round 2 cut: ranked by cumulative score, then Round 2 score, then supporters, then the stored coin flip.
- Game pack rule "would change at least two plans' scores" means: for at least two plans the points differ depending on which option wins. If fewer than the needed valid questions exist (AI + fallbacks), the best remaining non-overlapping questions are used.
- Fit is rounded to one decimal.
- "Looks off" threshold = min(3, max(2, ceil(30% of counted players))).
- Edits that change a stop's cost recalculate cost; the worked example's swaps keep the same cost.

## Flow and timers
- Quick Mode: 2 questions, 2 cards per plan, Guess cap +1, and short timers (quiz 30s, proposals 90s, taps 10s, cards 8s, vote 15s, others 10-20s). Proposals and the quiz keep longer timers so people can actually type.
- Every timed step advances early once all connected players are locked in.
- After each This or That question a 3-4s reveal shows the overall result.
- If fewer than 3 players submit the quiz, it auto-extends once by 30s (20s in Quick Mode); if still short, the game pauses and the host can restart the quiz.
- N = 0 plans after proposals: proposals reopen. N = 1: host picks "Add another idea" (proposals reopen) or "Lock it in" (straight to reveal).
- Pause: when fewer than 3 players are connected, the host's client pauses the timer (remaining time stored) and resumes it when 3 are back.
- Consolations run in a 30s window on the reveal screen. The runner-up's owner(s) pick one of 3 AI (or fallback) stops; eliminated proposers nominate one stop each to veto. If a veto empties a day, the first AI/fallback option for that day is added automatically (instead of asking the winner).
- "Lowest-scoring stop" for the runner-up replacement = weak first, then lowest Keep/Skip result, then the latest stop that day.
- Duplicate destinations: the second player is asked "Same trip as X's? Co-own or keep separate." at lock time. Auto-locked drafts (timer ran out) are kept separate. The host can merge two plans during Passport Control.

## AI
- One wrapper (`api/_lib/ai.ts`) and one provider file (`api/_lib/provider.ts`). Without `GEMINI_API_KEY` (or with `AI_MOCK=1`) the app uses mock/fallback content.
- Global queue: a per-minute counter in the database (`AI_RPM`, default 8) shared by all rooms; calls wait for a slot within their time budget, then fall back.
- Per-room cap: 60 calls. Responses are cached by prompt hash.
- Sidekick comments are dropped (not queued) if one was posted in the last 10 seconds.
