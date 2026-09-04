# la-events

A static site listing upcoming Los Angeles-area events. A recurring Cowork task
discovers events and writes them to `events.json`; the site reads that file and
renders it.

## File ownership

This is the most important rule in this repo. The two sides never cross.

| Path | Written by | Never touched by |
| --- | --- | --- |
| `events.json` | The Cowork task only | The human, by hand |
| `*.html`, `*.css`, `*.js` | The human only | The Cowork task |

- **The Cowork task writes `events.json` and nothing else.** It must not edit,
  restyle, or "fix" the HTML, CSS, or JS, even when a change would make the data
  render better. If the data needs a presentation change, say so in the run
  summary and leave the front end alone.
- **The human edits the HTML, CSS, and JS and nothing else.** Hand-editing
  `events.json` will be silently overwritten by the next task run.
- If the front end needs a new field, that is a schema change: update this file
  first, then the task starts emitting it. Do not add fields ad hoc on either side.

## Front-end hard rules

These three are permanent and non-negotiable. They apply to every change to the
HTML, CSS, and JS, and to any rebuild of the site from scratch.

**1. Cache busting.** Always fetch the data with a cache-busting query string and
`no-store`, exactly this shape:

```js
fetch(`events.json?t=${Date.now()}`, { cache: 'no-store' })
```

GitHub Pages and the browser will both happily serve a stale `events.json`
otherwise, so the site would show yesterday's events after the task has already
written today's. Never drop the query string, and never soften `no-store` to
`no-cache` or `default`.

**2. Fail visibly.** If `events.json` is missing, unreachable, or malformed, the
page must render a message saying what went wrong. Never a blank page, never a
silent `catch`, never a spinner that spins forever. Distinguish the causes the
reader can act on — network failure, HTTP status, invalid JSON, unexpected shape
— and always leave a retry affordance. The same applies to a single bad event
object: skip it, keep rendering the rest, and say some entries were skipped.

**3. Relative paths only.** Every asset reference is relative: `styles.css`,
`app.js`, `events.json` — never `/styles.css`. The site is served from a GitHub
Pages project subpath, where a leading slash resolves to the domain root and
breaks every link. This covers stylesheets, scripts, fetches, icons, and any
internal link added later.

## URL parameters

Filter state lives in the query string so a filtered view is bookmarkable and
shareable. Four params, all optional, all ANDed together:

| Param | Shape | Meaning |
| --- | --- | --- |
| `cat` | comma-separated lowercase category slugs, e.g. `cat=music,art` | Show only these categories |
| `q` | free text, e.g. `q=jazz` | Substring match on title, venue, and blurb |
| `from` | `YYYY-MM-DD` | Range start |
| `to` | `YYYY-MM-DD` | Range end |

`from` and `to` **replace the old single `weekend=1` toggle**, which no longer
exists. A range is an overlap test, not containment: an event matches when its
own `start`..`end` intersects `from`..`to` at all, so a multi-day event
straddling either edge is included. Either bound may appear without the other.
An inverted range (`to` before `from`) is corrected on read rather than left to
match nothing, and dates that do not parse are dropped. Omitting both means the
default view: everything from today forward.

Example: `?cat=music,art&q=jazz&from=2026-09-12&to=2026-09-14`

## Card structure: the title is the link, not the card

**Do not revert the card to a single wrapping anchor.** It was one once, and the
change away from it was deliberate:

- The card is an `<article>`. The **title**, and only the title, is the `<a>`
  that opens the event `url` in a new tab. The rest of the card is inert: there
  is deliberately no card-wide click handler, no `cursor: pointer` on the card,
  and clicking the blurb or the metadata does nothing.
- The card also carries an expand `<button>`, and **a button may not be nested
  inside an anchor** — that is invalid HTML and browsers handle it badly. That is
  the whole reason the card itself is no longer a link, so re-wrapping the card
  in an `<a>` would silently reintroduce the bug.
- The expand button still calls `stopPropagation()`. With no card-wide handler
  that is belt and braces, and it stays so the button keeps behaving if one is
  ever added back.

**Line clamps are part of the layout contract:**

| Element | Lines | Property |
| --- | --- | --- |
| `.card-title` | 2 | `-webkit-line-clamp: 2` plus standard `line-clamp: 2` |
| `.card-blurb` | 3 | `-webkit-line-clamp: 3` plus standard `line-clamp: 3` |

Clamp by line count, never by a fixed pixel height — a pixel height breaks under
a different font size or browser zoom. Both elements also set
`overflow-wrap: anywhere`, without which a long unbroken token runs off the card
edge on one line and the clamp never engages.

Because the content is bounded, the grid uses `align-items: stretch` and the
metadata block uses `margin-top: auto`, so every card in a row is the same height
with its metadata on the floor. The "more" control is rendered **only** when the
title or summary is actually clipped, measured from the laid-out element
(`scrollHeight > clientHeight`) and re-measured whenever the container's width
changes. Never render it unconditionally.

## Where the run status is shown

The header is the site name and the theme toggle, nothing more. The last-updated
date and the run recap live together on a status card above the event list,
never in the header.

## `events.json` schema

Top level is an object with exactly three keys:

```json
{
  "updated": "2026-09-03T08:00:00-07:00",
  "summary": "Added 41 new events (48 total) after a deep sweep of …",
  "events": [ /* array of event objects */ ]
}
```

- **`updated`** — ISO 8601 timestamp with offset, set to when the task last ran.
  Always Pacific (`-07:00` during PDT, `-08:00` during PST). The site renders it
  on the status card as `Last updated Sep 4, 2026`. It is not shown in the
  header.
- **`summary`** — a prose recap of the most recent run, 40 to 80 words, plain
  text with no markup. Written by the Cowork task on every run and by nothing
  else: the human never edits it, and the front end only displays it. Say what
  changed and why it is worth a glance — how many events were added and how many
  the file now holds, which sources were swept, a highlight or two worth
  surfacing, and anything archived. For example:

  > Added 367 new events (492 total) after a deep sweep of comedy, pop-up, art,
  > and food sources plus a club-by-club pass on concerts. Highlights: a
  > three-night SoFi Stadium run and the LA Chocolate Salon. Archived 3 events
  > that already passed.

  The key is always present. If a run has nothing worth recapping it may be an
  empty string, and the site then shows the last-updated line alone rather than
  an empty status card.
- **`events`** — array of event objects, described below. Order is not
  significant; the front end sorts.

### Event object

Every event has all thirteen fields, in this order, with no field ever omitted
and no field ever `null`. If a value is unknown, use a sensible free-text
placeholder in the free-text fields; the structured fields must always be real.

| Field | Format | Notes |
| --- | --- | --- |
| `id` | `YYYY-MM-DD-title-slug` | Date slug + title slug, lowercase, hyphenated |
| `title` | free text | Event name as billed |
| `category` | one of the fixed list | See below — never invent a new one |
| `start` | `YYYY-MM-DD` | First day |
| `end` | `YYYY-MM-DD` | Last day; equals `start` for single-day events |
| `time` | free text | e.g. `8:00 PM`, `5:00 PM - 11:00 PM`, `Doors 2:00 PM` |
| `venue` | free text | Specific place, not the neighborhood |
| `area` | free text | Neighborhood or region, e.g. `Highland Park` |
| `price` | free text | e.g. `Free`, `$25`, `From $189`, `$34 - $58` |
| `url` | absolute URL | **Required.** See below |
| `source` | free text | Where the listing was found |
| `blurb` | free text, one sentence | Short description |
| `discovered` | `YYYY-MM-DD` | Date the task first saw this event |

### Field rules that matter

**`id` — deduplication key.** The date slug plus the title slug. This is what
makes deduplication possible across daily runs: the task re-reads the existing
`events.json`, and any event whose `id` already exists is an update, not a new
row. Because `id` is derived from date and title, a stable event keeps a stable
id across runs. Never renumber or regenerate ids for events already in the file.

**`start` / `end` — always `YYYY-MM-DD`.** No times, no ranges inside the string,
no other format. `end` equals `start` for single-day events, so the front end can
treat every event as a range without special-casing. An event that runs past
midnight uses the following date as `end`.

**`category` — fixed list.** Exactly one of:

```
Music  Comedy  Food  Art  Film  Sports  Nightlife  Community  Outdoors  Other
```

The list is fixed on purpose: fixed categories are what let the front end add
filter buttons that stay correct without being regenerated from the data. Nothing
that fits a named category goes in `Other`. Adding a category is a schema change
— update this file and the filter UI together, never just the data.

**`time`, `price` — free text, because reality is messy.** A venue may bill a
time as `Doors 2:00 PM` or `Sets from 9`, and a price as `Free with RSVP` or
`$20 - $65 + fees`. Copy what the source says rather than forcing it into a
structure that will lose information. Everything else in the schema is
structured; these two are deliberately not, so do not try to parse them in JS.

**`url` — required.** An event with no link is not usable, so it does not go in
the file at all. Prefer the ticketing or official event page over an aggregator.

**`discovered` — enables the "added today" badge.** Set to the run date when the
event first enters the file, then never changed on later runs. The front end
compares it against `updated` to badge new arrivals.

## Conventions

- Dates and times are America/Los_Angeles throughout.
- The file is UTF-8, two-space indented, with a trailing newline.
- Events that have fully passed may be dropped by the task; the front end should
  still tolerate seeing them.
