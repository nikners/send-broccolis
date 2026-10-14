# Send Broccolis — low-fidelity wireframe prototype

> This is a low-fidelity prototype, not a working product. All AI output is hardcoded and the data is synthetic.

**Send Broccolis** is a placeholder name for a campaign builder. The prototype deliberately looks like a
wireframe: greyscale, boxy, 1px borders, square corners, no shadows, no gradients and no images. The
phone preview is drawn from `div`s.

There is **no backend, no API and no real AI**. Every "draft" is a canned string looked up in
`data.js`, and the check rules are simple demonstrations written in JavaScript. Nothing is sent,
nothing is stored, and reloading the page resets everything.

---

## How to open it

Double-click **`index.html`**. That is the whole procedure.

You do not need a server, a build step, a package manager or an internet connection. The files use
plain `<script>` tags (not ES modules) specifically so that they work when opened directly from disk.

If you would rather serve it, any static server works, for example:

```
python -m http.server 8000
```

then open <http://localhost:8000/index.html>.

**Sign in with any non-empty username and password.** Leaving both fields empty shows an inline
error under each one.

---

## Screens

Hash routes are listed in the order you meet them.

| Route | Screen | What is on it |
| --- | --- | --- |
| `#/login` | Login | Username and password. Empty fields produce inline, labelled errors. |
| `#/campaigns` | Campaigns dashboard | Table of campaigns (Name, Channel, Recipients, Status, Updated), a status counter, and a "New campaign" button. Row actions are Resume (Draft), Cancel schedule (Scheduled) and View (Sent). |
| `#/new/goal` | Step 1 — Goal | One large text box, plus three clickable example goals that fill it. Next is disabled below 10 characters, with a line explaining why. |
| `#/new/draft` | Step 2 — Draft | A 1.5 second "Drafting your message…" state, then an editable draft with a character counter and a **Regenerate** button that cycles through the canned alternatives. |
| `#/new/channel` | Step 3 — Channel | Three channel cards, one marked **Suggested** with a plain-language reason, per-channel notes, and a div-drawn phone preview that updates live as you type. |
| `#/new/checks` | Step 4 — Checks | A list of checks, each marked Pass, Warning or Error **in words**. Errors block Next; warnings require ticking a box. Each failure offers a fix or a link back to Draft. |
| `#/new/review` | Step 5 — Review and send | Summary card, recipient segment dropdown with counts, final phone preview, and a choice of Send now or Schedule for a date and time. |

Steps 1 to 5 share one stepper and one status line at the top of the page, plus one Back / forward
button bar fixed to the foot of the viewport. Neither moves between steps.

### Supporting UI

- **Confirm dialogs** — used by Schedule, Send broccolis now and Cancel schedule. `Escape` closes any of them.
- **Toasts** — a plain confirmation after sending, and an 8 second toast with a countdown bar and an
  **Undo** after scheduling or after cancelling a schedule.
- **Heuristic notes toggle** — in the top bar, off by default. Turning it on adds small bordered tags
  next to the relevant elements. The **Legend** button opens a fixed-position panel, so the legend
  never pushes page content down.

---

## Heuristic mapping

Only five heuristics are used, and a tag is only added where the prototype genuinely demonstrates it.

| Heuristic | Where it appears in the prototype |
| --- | --- |
| **H1 — Visibility of system status** | The "Draft saved HH:MM" status line near the stepper, which uses `role="status"`. The 1.5 second "Drafting your message…" state is announced rather than left as a silent wait. The phone preview updates live as the text changes. Campaign statuses, the dashboard counter and toasts all state their state in words. |
| **H3 — User control and freedom** | Back never clears what you typed: the whole in-progress campaign lives in one in-memory object, so leaving a step and returning restores the goal, message, channel and segment. Drafts are kept and Regenerate cycles rather than replaces. Both the schedule toast and the cancel-schedule toast offer a working Undo, and Cancel schedule is always available to the user. |
| **H4 — Consistency and standards** | The five-step stepper and the status line render from one shared function, so they are identical on every step. The Back and forward buttons live in a separate bar fixed to the foot of the viewport, so they stay in the same place however long a step's content is — Back at the bottom left, the forward button at the bottom right, keeping the same right-hand edge even when its label changes from "Next" to "Send or schedule", "Schedule" or "Send now". Scrollbar space is reserved so a shorter step cannot shift the layout sideways. |
| **H5 — Error prevention** | Checks run before sending and are shown as a list rather than hidden. Errors block Next outright; warnings require explicit acknowledgement. Each failing row offers either a one-click fix ("Add it", "Use approved template") or a Back to Draft link. Scheduling, sending and cancelling a schedule all ask for confirmation, and the destructive Send now dialog explains that there is no Undo and focuses Cancel by default. Scheduling without a date is blocked with an inline error. |
| **H6 — Recognition rather than recall** | Three example goals are offered rather than asking you to invent phrasing. The suggested channel is labelled **Suggested** and gives a one-line reason for the suggestion. The four approved WhatsApp templates are listed on screen, and the full message text is visible in the phone preview and again at review. Recipient segments are shown as names with counts. |

---

## Hardcoded demonstration values

To be explicit about what is real and what is not:

- **AI output is hardcoded.** The drafting delay is a `setTimeout`, and the text it reveals is a
  canned string chosen by a lookup table in `data.js`. No model, no network request, no generation.
- **Check rules are hardcoded.** The five rules (empty message, unfilled placeholder, SMS length,
  WhatsApp approved template, opt-out wording) are simple demonstrations for discussion. They are not
  compliance, deliverability or regulatory checks, and a real product would need far more.
- **Data is synthetic.** Campaign names, recipient segments and counts are invented. No real company,
  brand, customer or contact appears anywhere.
- **The accent colour is only ever a warning or error**, and every one is also written in words as
  `Warning:` or `Error:` so nothing depends on colour alone.

---

## Assumptions

1. Any non-empty username and password signs you in; there is no credential check.
2. A typed goal matches a canned example if it is an exact match once case, spacing and punctuation
   are ignored. Failing that, a goal containing "overdue", "sale" or "appointment" matches that
   example. Anything else uses the generic draft.
3. The generic fallback has only one canned draft, so on that path **Regenerate** explains that it has
   nothing to cycle through instead of appearing broken.
4. The suggested channel is pre-selected the first time you reach the Channel step, so you confirm a
   recommendation rather than having to guess. It is never applied over a choice you made yourself.
5. Goals outside the three examples get no channel suggestion, because this prototype only ships one
   for the examples.
6. SMS length counts the raw text. One part up to 160 characters; beyond that the part count is
   `ceil(length / 153)`.
7. The WhatsApp approved-template comparison ignores case, spacing and punctuation, but keeps
   `{name}` intact.
8. The opt-out wording check applies only to the weekend sale goal.
9. Seeded "Updated" values are fixed strings, not derived from the clock, so the dashboard looks the
   same on every run.
10. Ticking "I have read the warnings" is reset if you change the message, so you cannot acknowledge
    a warning about text that no longer exists.
11. **Undo** after cancelling a schedule puts the campaign back to Scheduled, matching the Undo
    offered after scheduling.
12. `Escape` and a click on the backdrop both cancel a dialog, exactly as the Cancel button does.
13. Sending deliberately has no Undo, and the dialog says so before you confirm, since that
    asymmetry is the point being demonstrated.
14. The saved timestamp is HH:MM, so it only visibly changes when the minute changes.
15. State is in memory only. Reloading the page or signing out resets everything back to the four
    seeded campaigns.
