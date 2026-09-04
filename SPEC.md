LA Events

A single page listing upcoming events in the greater LA area. It reads
events.json and renders it.

Default view: chronological, grouped by day, starting today. Past events
never appear. Day headers stick to the top of the viewport as you scroll.

Interactions: category filter chips along the top, a search box matching
title, venue, and blurb, and a date range picker. Filters apply instantly,
no submit button, no page reload, and they combine with AND. Filter state
lives in the URL so I can bookmark and share a filtered view.

Date range picker: two native date inputs, from and to, styled to match
the rest of the header row rather than left as bare browser defaults, plus
quick preset chips beside them for Today, This Weekend, and Next 7 Days.
Clicking a preset fills both dates and applies immediately. Typing custom
dates overrides the presets, and no preset stays visually active once a
date has been hand edited. A Clear control resets to no date filter, which
is everything from today forward. An event counts as in range when its own
start through end overlaps the picked range at all, so a multi-day event
straddling either edge is included, not just single-day events. If "to" is
before "from" the range is corrected rather than silently showing zero
results. If the range excludes today, the status card and the day group
headers still work normally, starting from the picked range instead of
today. Native inputs on mobile, no custom calendar widget and no new
dependency; the controls may wrap to a second line on a narrow phone.

Each event is a card showing title, category, date and time, venue, area,
price, and a two-sentence summary. The title, and only the title, is the
link to the event's url, opening in a new tab; the card is not itself an
anchor, because it carries an expand button and a button cannot be nested
inside a link. Clicking elsewhere on the card does nothing. Events
discovered in the last 24 hours get a "new" badge.

Card text is clamped: the title to 2 lines, the summary to 3, both by line
count rather than a pixel height so they survive font-size changes and
zoom. When either is genuinely cut off, and only then, a small "more"
control at the bottom of the card expands that card in place to reveal the
full text, pushing the cards below it down. "less" collapses it again. No
modal.

On mobile only, at phone widths, both filter rows, the category chips and
the date range picker, hide themselves together as you scroll down to
reclaim vertical space, and come back the moment you scroll up. Hiding is reluctant and showing is eager: it takes about 14px
of cumulative downward movement to hide, while about 8px upward brings
them straight back. Both are cumulative and per direction, so the jitter in
a momentum scroll cannot make them flicker. It stays visible near the top of the page
whatever the direction, so it never flickers while you are barely
scrolling, and they do not hide right at the end of the list. The rows
animate out over 700ms on a decelerating curve, slower than the 150ms used
for hover feedback because they are a much taller element, collapsing their
height and sliding slightly rather than only one or the other, so the
sticky day headers move up to close the gap instead of leaving an empty
band. Together they give back about 125px
of a phone screen. Under prefers-reduced-motion the rows simply stay
visible and nothing animates. Desktop and tablet are unaffected: both rows
are always visible there.

Because both filter rows can be hidden, a small filter indicator sits in
the search row: a dot, the number of active categories, and the active
date range. It appears only when at least one category filter or a date
range is set, and it stays put regardless of the filter rows, so scrolling
a filtered list never loses all trace of the filter.

Header: site name and theme toggle. Nothing else.

Status card: above the event list, before the first day header. Two parts,
"Last updated [date]" from the updated field, formatted like Sep 4, 2026,
and below it the prose recap of the most recent run from the summary
field. Shares the event cards' surface, border, radius, and shadow so it
sits in the same visual family, but stays quieter through type alone: not
clickable, no hover lift, no category accent edge, muted text relative to
the events, and never competing with the first day's cards for attention.
If summary is missing or empty, only the last updated line shows.

States: loading, loaded, empty after filtering, and failed to load. Loading
shows skeleton cards, not a spinner. The failure state says what went wrong
rather than showing a blank page.

Design

Modern and sleek, not austere. Cards with real presence, generous spacing,
confident typography. It should feel like a well built product, not a
directory listing and not a spreadsheet.

No images anywhere. The card carries its weight through type and color
instead. Titles are large and the clear focal point. Each category has its
own accent color, applied to a category pill on the card and to a thin bar
or left edge treatment, so the grid reads as varied and scannable at a
glance rather than uniform.

Theme: follows the system light/dark setting by default, with a manual
toggle in the header that overrides it and persists. Both themes fully
designed, neither an afterthought. Dark is near-black around #0D0D0F with
elevated card surfaces. Light is warm off-white, not pure white. Category
colors are tuned separately for each theme so contrast holds.

Cards: 12px radius, soft low-opacity shadow that lifts slightly on hover
along with a 2px rise. Subtle border carrying most of the separation in
dark mode, where shadows do less work. Restrained gradient permitted on the
new badge and active filter chips.

Typography: one modern sans, Inter or the system stack. Titles at 600
weight, around 20px, and clearly the loudest thing on the card. Summary in
a muted tone at comfortable reading size. Metadata smaller, with time and
price in tabular numerals.

Icons: a small consistent set, outline style, one weight. Used for metadata
rows (location, clock, ticket) and the theme toggle. Never decorative.

Layout: single column on mobile, two columns on tablet, three on wide
screens. With the title and summary clamped, cards in the same row are
equal height, with the metadata sitting on the floor of the card. Mobile
first, since I will mostly check this on my phone.

Motion: fast and subtle. 150ms on hover and theme change, a short stagger
as cards enter after filtering. Respect prefers-reduced-motion.

Constraints

Static site. No frameworks, no build step, no dependencies. Icons inline as
SVG, no icon library. Fast on cellular. Relative paths only. The stylesheet
and script carry a manual ?v= cache key that gets bumped whenever they
change, so a deploy can never serve new HTML against a stale asset.
