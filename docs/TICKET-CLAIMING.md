# How to claim tickets — the heart-react system

This is the original Repair Zone convention for working repair tickets in Discord.
Each ticket is a **forum post** in the `repair-requests` channel; its state is shown
by a single **heart reaction** on the post. The bot now applies these hearts
automatically as a ticket's status changes, but the meanings are unchanged so the
manual convention still reads the same.

> Reference (original write-up): [`ticket-claiming-reference.png`](./ticket-claiming-reference.png)

## Heart legend

| Heart | Meaning | Repair Zone status |
| :---: | ------- | ------------------ |
| _(none)_ | **Active / unclaimed** — free for anyone to pick up | `open` |
| 💛 | **Actively being worked on** | `claimed`, `in_progress` |
| 💚 | **Closed — success** | `done` (repaired), `picked_up` |
| 🩶 | **Closed — partially resolved** | _(no matching status yet)_ |
| 💗 | **Closed — unresolved** | `unable` |

## Working a ticket

1. Tickets live in the exhibitor Discord, in the **`repair-requests`** channel. If
   you don't have access, ask Evan to get you in.
2. An **active ticket has no reactions.** Claim it by adding a **💛** react (or use
   `/claim <id>` — the bot then sets 💛 for you).
3. **Only one person** claims a ticket at a time — they're the point person for it.
4. Check whether the ticket needs more info. If so, **@ the ticket creator** in the
   thread to sort out what's needed.
5. **Keep the heart current** as the work progresses/completes:
   - 💚 done and successful
   - 🩶 done but only partially resolved
   - 💗 done but couldn't resolve it
6. If a ticket ends **partially resolved or unresolved**, leave a **short note in the
   thread** explaining why we couldn't fully help. We review these after the event to
   tune next year's setup.
7. Extra requests may be assigned by **Evan or Rocky** outside the ticket system.

## How the automation maps to this

The website admin panel and the Discord slash commands (`/claim`, `/status`) are the
source of truth. Whenever a repair's status changes, the bot updates the forum post:
it posts a `Status → …` line **and** swaps the post's heart to match the table above
(removing the previous heart first, so there's only ever one). `open` clears the heart
back to "active". This requires the bot to have **Add Reactions** on the forum channel.
