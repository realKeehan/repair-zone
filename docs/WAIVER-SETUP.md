# Online waiver setup (Tally)

The `/waiver` page lets people read and sign The Repair Zone liability waiver
online — before they arrive or at the booth — so they can skip the paper line.
We host the form on [Tally](https://tally.so) because its **free plan supports
signature fields and a high monthly submission volume**, which we need for a
busy weekend booth.

> [!IMPORTANT]
> The **signed paper agreement still governs** (see the copy on `/terms` and the
> line at the bottom of `/waiver`). Treat the online form as a convenience that
> speeds up booth check-in. Before you rely on the online signature as the *only*
> waiver — especially for minors or anything legally binding — get it cleared
> with a lawyer. Attendees aren't identity-verified and we're an unincorporated
> volunteer group.

## How it's wired

- **`TALLY_WAIVER_FORM_ID`** (in `.env`) holds the form ID. The server exposes it
  to the browser via `/js/site-config.js` as `window.RZ_CONFIG.tally.waiverFormId`.
- **`public/js/waiver.js`** builds a Tally iframe from that ID and loads Tally's
  `embed.js` for dynamic height. No form ID → the page shows a friendly
  "not set up yet" message instead of a broken embed.
- **CSP**: `src/server.js` allows `https://tally.so` as a `frame-src` and
  `script-src`. If you move the form to another host, update the CSP too.

## One-time setup

1. Create a free account at <https://tally.so> and start a new form.
2. Build the waiver. A good field set:
   - **Full name** (short text, required)
   - **Email** (email — gives the signer a copy + a submission record)
   - **Phone** (optional)
   - A **long-text / rich-text block** with the waiver language (mirror `/terms`;
     the source is in [`docs/terms-source.txt`](./terms-source.txt) and the PDFs).
   - **"I have read and agree"** (checkbox, required)
   - **Signature** (Tally's *Signature* field, required)
   - Optional: **Date** (or let the submission timestamp stand in).
3. Publish the form. Copy its share link, e.g. `https://tally.so/r/wA1bCd`.
   The ID is the last part — **`wA1bCd`**.
4. Put it in `.env`:
   ```
   TALLY_WAIVER_FORM_ID=wA1bCd
   ```
   (Pasting the full `https://tally.so/r/wA1bCd` URL also works — the loader
   extracts the ID.)
5. Restart the app (on cPanel: **Setup Node.js App → Restart**) and open
   `/waiver` to confirm the form renders.

## Where submissions go

Signed waivers live in your **Tally dashboard** (Submissions tab) — export to
CSV or wire up Tally's email/webhook notifications from there. They do **not**
flow into the app's `data/db.json`; the app only embeds the form. If you later
want checkouts to require a signed waiver, that's a follow-up (e.g. a Tally
webhook into `/api`).

## Troubleshooting

- **"Online waiver isn't set up yet"** → `TALLY_WAIVER_FORM_ID` is blank or the
  app hasn't been restarted since you set it.
- **Blank area / iframe blocked** → check the browser console for a CSP error; make
  sure `https://tally.so` is still in the `frame-src`/`script-src` in
  `src/server.js`. The "Open the waiver in a new tab" link is the fallback.
- **Form loads but looks cramped** → the embed uses `dynamicHeight`; make sure
  `embed.js` loaded (Network tab) — it's what resizes the iframe.
