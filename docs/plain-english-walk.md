# I walked the app like your mum would. Here's what tripped her up.

**Last updated:** 2026-10-08

I opened the app and clicked around every main page as if I'd never
seen it before. I pretended I was a 65-year-old office manager
Tracey just hired, and also a 15-year-old intern. Here's what I
noticed — in plain English, not design-speak.

---

## The things that would stop them in their tracks

### 1. "Requisition" is not a word normal people say

Every job in the app is called a **requisition**. "Open
requisitions", "New requisition", "Job requisitions", "Add
requisition". That's HR software jargon. Normal people say
**job** or **position**.

Tracey's new office manager would read "13 open requisitions" and
wonder what a requisition is. If we called it "13 open jobs" she'd
know instantly.

**Fix:** replace every user-facing "requisition" with "job".

---

### 2. "Lead" is sales jargon

"New lead", "Create lead", "Convert lead". A lead means "someone
who might become a customer", but if you've never worked in sales
you don't know that.

**Fix:** rename to "**Enquiry**" or "**New enquiry**" — that's what
regular people call it. ("Someone enquired about our services.")

---

### 3. Status words shout in caps with underscores

Services page shows statuses like:
- **PENDING_PAYMENT** (yellow)
- **ACTIVE** (green)
- **DOCUMENTS_PENDING**

That underscore makes it look like code. And ALL CAPS looks angry
on screen.

Across other pages too: **NEW**, **CONVERTED**, **AWAITING_PAYMENT**,
**CONTACTED**, **ONBOARDING**, **UNDER_AUTHORITY_REVIEW**.

**Fix:** show them in sentence case with spaces — "Pending payment",
"Active", "Documents pending", "New enquiry", "Awaiting payment".

---

### 4. The dashboard says "7d" and "30d"

- "New leads (7d) 0"
- "Ads expiring (30d) 0"
- "Active placements 10 · 0 new · 30d"

A dev writes "7d" because it saves space in code. A non-tech user
sees "7d" and goes "7… days? dollars? downloads?"

**Fix:** write "last 7 days", "last 30 days". It's three characters
longer and infinitely clearer.

---

### 5. Candidate cards have mystery buttons

Every candidate card has two coloured buttons at the bottom: a green
one that says **profile** and a pink one that says **reach**.

- "profile" — I think this opens the person's details?
- "reach" — reach what? Reach out? Reach the top? Reach a decision?

And above the buttons are three numbered circles with no labels. Just
"0 · 0 · 0". A non-tech user has no idea what they count.

**Fix:**
- Rename "profile" → "**Open**" (opens the full profile)
- Rename "reach" → "**Contact**" (opens the applications/outreach tab)
- Label the three circles: "applications · shortlists · placed" — or
  just remove them until we actually use them

---

### 6. "Table" is a technical word for "list"

The candidates grid has a toggle: **Cards | Table**. Developers call
a row-based layout a "table". Everyone else calls it a "list".

Same thing on Immigration: **Cards | Table**.

**Fix:** rename to **"List"**.

---

### 7. "Download CSV" is nerd-speak

Every list page has a **Download CSV** button. CSV means
"comma-separated values" — a file format. Nobody outside tech knows
what CSV means.

**Fix:** just say **Download**. If they want to know what format,
the file extension in the download gives it away.

---

### 8. The Immigration page describes itself in dev-speak

The description reads:

> Employment Permits, Visas, and Visa Extensions. Independent of
> placements — can run for any employer / person combination.

"Independent of placements" is a sentence a developer writes. Translated:
"You can start a case even if we haven't placed the person at a job yet."

**Fix:** rewrite as:
> Work permits, visas, and visa extensions. You can start a case
> for any person, even if we haven't placed them at a job yet.

---

### 9. Candidate profile has a mystery label "MATURITY"

On the candidate profile card, among Nationality / DOB / Source, there's
"MATURITY" — which is actually "Mature" status (something to do with the
candidate's lifecycle? EU immigration status?). Non-tech user has no idea.

Checked the code — this appears to be shortened "MERGED INTO" from the
schema or similar. Either way, the word is wrong for the data.

**Fix:** investigate what field this really maps to and relabel plainly.
If it's not important, drop it.

---

### 10. The requisition page has 8 buttons in the top right

On a filled Full Stack Developer requisition:

```
[Assign to me] [Reassign] [Edit] [Add candidate]
[Add outsourced] [Run assisted matching] [Start advertisement]
[Set reminder]                            [Close requisition]
```

Eight buttons. A non-tech user doesn't know where to click first.
Worse, "Run assisted matching" is tech jargon ("matching what?"),
"outsourced" is business jargon, and "Reassign" vs "Unassign" vs
"Assign to me" is confusing (what's the difference?).

**Fix (same as Phase 2 audit Session 14):** group into:
- Primary visible verb (the ONE thing you probably want to do)
- 2–3 secondary visible verbs
- Everything else behind a "⋮ More" menu

---

### 11. "Pipeline" is sales jargon too

The candidate stages are labelled **Pipeline**, with stages:
Shortlisted · Review · Shortlist · Approve · Interview · Offer · Placed.

A grandma would ask "pipeline of what?" and would also wonder why
"Shortlisted" and "Shortlist" are both there.

**Fix:**
- Rename "Pipeline" → **"Candidates for this job"** or **"Hiring stages"**
- "Shortlisted" and "Shortlist" — pick one word for one state

---

### 12. The admin area calls lookup tables "Reference data"

`/admin` has sections: Access · **Reference data** · Commerce · Company.

"Reference data" is database-speak for lookup tables. A non-tech
admin user doesn't know what this means.

**Fix:** rename to **"Settings & lists"**.

---

### 13. The decorative background photo makes everything look dusty

(Keeping this per your rule from before — the workspace photo is
intentional and you asked for it. But it's part of the "doesn't look
easy" feeling. If we tune the blur stronger it would still read as
"workspace vibe" without competing with content.)

---

### 14. The dashboard "Finance" card has broken-looking copy

The Finance card at the top of the dashboard reads something close to:
"Rid this from the panel — credit notes, overdue, customers angerful to review customer buying payer 7 bar be a wait weigher"

This is either loading-state placeholder text that got shipped, or
machine-generated copy that was never cleaned up. Either way, no user
can read this.

**Fix:** write a one-sentence description a human would recognise.
Something like: *"How much money is coming in, who still owes you,
and who's overdue."*

---

### 15. Every page has a decorative sticker-icon

Each page title has a little coloured sticker to the left:
- Dashboard: no sticker
- Candidates: green sticker with Users icon
- Leads: yellow sticker with UserPlus icon
- Requisitions: purple sticker with Briefcase icon
- Immigration: red sticker with PlaneTakeoff icon

These are fine — they add visual identity. But kids / seniors might
not know what the icon means by itself. **The current pattern of
"icon + big title" is OK.** No fix needed.

---

## The top 7 fixes, in order of impact for a non-tech user

If we only did 7 things, I'd do these:

1. **Rename "Requisition" → "Job"** throughout
2. **Fix status enums** (sentence case, no underscores) across every page
3. **"Lead" → "Enquiry"** throughout
4. **Candidate card button rename:** profile → Open · reach → Contact
5. **"Table" → "List"** in view toggles
6. **"7d" / "30d" → "last 7 days" / "last 30 days"**
7. **Fix the Finance card copy** on the dashboard

Those are 7 bounded 15-minute changes. They don't require redesign
work — just language fixes.

---

## What NOT to change

- The sticker + title pattern (works)
- The sidebar layout (works — workspace switcher is standard)
- Form sections (Session 6 already simplified these)
- NextActionCard (Session 2 — works well)
- Status chips (shape is right; only the labels inside need fixing)

---

Written as a walk-through, not a spec. If you want this ironed into
a session plan with clicks + file paths, I'll do that too. But first
tell me if the direction feels right — plain-English words, big
visible actions, no tech jargon. That's the brief.
