# Course Hub

A directory of **offers**, each one its own course academy: its own courses, its own
students with their own logins, its own settings. The owner runs the directory and
switches between them; a student only ever sees the one they belong to and never learns
the others exist.

Same login model as the Content Hub and the Sales Rep Hub: accounts live in this app's
own Postgres, passwords are bcrypt-hashed, and the session is a signed JWT in an
HttpOnly cookie. No third-party auth console to configure.

- `/` — decides where you belong and sends you there. The URL you give anyone is just the domain.
- `/login` — one sign-in for everyone; the account decides where you land.
- `/setup` — first run only, mints the one owner. Closed the moment an account exists.
- `/hub` — **the directory of your offers.** Owner and cross-offer admins only.
- `/h/<offer>` — that offer's course grid, with each student's own progress.
- `/h/<offer>/c/<course>` and `/h/<offer>/c/<course>/<lesson>` — a course, and the player.
- `/h/<offer>/manage` — the courses of that offer · `/manage/<id>` — the builder.
- `/h/<offer>/students` · `/progress` · `/settings` — the roster, the grid, the offer's own settings.
- `/account` — your own password. Outside every offer, the same page for everyone.
- `/no-hub` — signed in with nowhere to go: their offer is closed, or they are on none.

## Adding an offer

`/hub` → **New offer**. It arrives **furnished**: a first course with a first chapter
and the settings every offer starts with, so pressing `+` never lands you on a blank
page trying to remember how this goes together. Everything it makes is ordinary and can
be renamed or deleted.

It starts as a **draft** — closed to students — because an offer opens when somebody
decides it is ready, never because it was created. Open it from the tile's `⋯` or from
its Settings.

Drag the tiles to set the order. Rename, re-slug, re-tint and delete an offer from
`/h/<offer>/settings`.

## Everything is scoped by offer

| | |
| --- | --- |
| **Courses, chapters, lessons, progress** | belong to one offer |
| **Students and their logins** | belong to one offer |
| **Download codes and the download log** | belong to one offer |
| **Download mode, and every other setting** | belongs to one offer |

A course slug is unique **within** an offer, not globally — two offers may both
sensibly have a "Start Here", and neither should be pushed to `start-here-2` because of
the other.

Asking for an offer that is not yours answers **404**, never a redirect, so the app
never confirms that another offer is there. That holds for the video stream too: a
student of one offer holding a lesson id from another gets the same answer as a
stranger.

## The team

**`/h/<offer>/settings` → Team.** A team member is an admin **bound to one offer**.
Inside it they do everything the owner does; outside it there is nothing.

| | Owner | Team member |
| --- | --- | --- |
| Build courses, lessons, chapters in this offer | ✅ | ✅ |
| Delete a course in this offer | ✅ | ✅ |
| Add and manage this offer's students | ✅ | ✅ |
| Issue and withdraw download codes, read the log | ✅ | ✅ |
| Rename, re-tint, open or close this offer | ✅ | ✅ |
| Add another team member to this offer | ✅ | ✅ |
| Remove a team member | ✅ | ❌ |
| Delete the whole offer | ✅ | ❌ |
| See `/hub` and your other offers | ✅ | ❌ |

The boundary is one field — the `hubId` on their account. `/hub` sends them back to
their own offer, and every other offer answers 404 rather than admitting it exists.

Two deliberate exceptions to "everything the owner does":

- **They cannot remove a team member.** That is how two admins who disagree lock each
  other out of an offer at three in the morning. Adding is fine — bounded to the same
  offer it is the authority they already hold, handed on.
- **They cannot delete the offer.** They run it; destroying it is a different thing.

Students are added on the **Students** tab, team members in **Settings** — one form per
kind of person, rather than one form with a dropdown that quietly changes what you are
creating.

## Who can see what

| | Courses grid | A course | `/admin/*` | Hidden course | Drip-fed lesson |
| --- | --- | --- | --- | --- | --- |
| Owner | ✅ | ✅ | ✅ | ✅ | opens immediately |
| Admin | ✅ | ✅ | ✅ | ✅ | opens immediately |
| Student | published only | published only | ❌ | 404 | on its date |
| Signed out | ❌ | ❌ | ❌ | ❌ | ❌ |

Enforced in `src/lib/access.ts`, which every page and every server action calls first —
so a crafted URL or a replayed form post lands on the same check as a click. Hiding a
tab is a courtesy; that file is the control. A hidden course answers 404 rather than
"not for you", so the app never confirms that a course a student cannot see exists.

The owner and admins differ in exactly three places: only the owner may delete a
course, add an admin, or manage another admin's account.

## Building a course

`/admin/courses` → **Add course**. It starts **hidden**, with one empty chapter — a
course appears to students because someone decided it was ready, never because it was
created. Publish it from the `⋯` menu or from Course settings.

Inside, the outline is on the left and one lesson on the right.

| | |
| --- | --- |
| **Chapters** | Add, rename in place, drag by `⠿`, collapse, delete (with its lessons) |
| **Lessons** | Add (Multimedia or PDF), drag within a chapter **or into another one**, `⋯` to copy the link or delete |
| **A lesson** | Title · video · thumbnail · attachments · drip · the writing under the player |

**Everything saves itself.** There is no save button on a lesson, because there is no
moment when one is finished — you paste a video, write two sentences, come back
tomorrow and add a file. The corner says *Saving…* then *Saved*. Typing is debounced;
a click (a video attached, a file removed) writes straight away.

## Video

Three ways in, and they are genuinely different:

| | How it plays | How it completes |
| --- | --- | --- |
| **Upload** — .mp4, .mov, .webm, .mpeg, anything | Your own file, in the browser's `<video>` | **By itself**, at 90% watched |
| **Embed** — YouTube, Loom, Vimeo, Wistia, Drive | In their iframe | The button |
| **Paste** — take the video off another lesson | Whichever of the two that lesson was | The same |

Uploads are the only shape where the page can see the playhead, which is why they are
the only ones that tick themselves — and why they also **resume where the student left
off**. The *Mark as complete* button is always there regardless: someone who watched a
lesson on their phone should not have to sit through it again to tick it.

A link from a host that refuses to be framed becomes a button that opens it, rather
than a silent blank box.

## Lesson thumbnails look after themselves

**A video lesson never needs a thumbnail chosen for it.** The still comes from the
video, by whichever route can actually get one:

| Video | Where the still comes from | Cost |
| --- | --- | --- |
| **Upload** | A frame grabbed in the browser before the file is sent | None — the file is already in memory |
| **YouTube**, **Drive** | Constructed from the link | No network call at all |
| **Loom**, **Vimeo**, **Wistia** | Asked for over oEmbed, once, when the link is pasted | ~350ms, at save time only |

The grabbed frame is taken a tenth of the way in, clamped to between 1 and 20 seconds:
the opening second of a video is very often black or a fade, and a black thumbnail is
worse than none.

Resolved **when the video is attached**, not on every render — a course page showing
twenty lessons would otherwise hit three different companies every time anyone opened
it. The still is cleared with the video it came from, so a replaced video can never
leave the old one's frame behind.

**Choosing one by hand is the exception, not the route.** The picker only appears for a
lesson with no video — a PDF, or one still being written. Where a still already exists
the pane just says where it came from, with *Use my own instead* folded behind it for
the occasional bad frame. A hand-picked thumbnail always wins over the derived one, and
removing it falls back to the video's still rather than to nothing.

Anything that cannot be resolved — a dead link, a host that is down, a format the
browser cannot decode — shows a **▶** in the outline. Losing the *video* because its
thumbnail service was slow would be the worse failure, so every step here fails to
"no picture" rather than throwing.

**Pasting a video does not copy the file.** Both lessons point at the same stored
video, so deleting one lesson does not take the other's video with it.

## Where the files go

| | |
| --- | --- |
| **Course art** | Shrunk in the browser and stored as its own bytes on the row. No file store involved. |
| **Videos and attachments** | Blob storage, uploaded **straight from the browser**. |

The second one matters: a serverless function caps a request body at a few megabytes,
so a 900MB lesson video cannot be posted through this app at all. The browser asks
`/api/upload` for a short-lived token and uploads directly; only the URL comes back.

Set `BLOB_READ_WRITE_TOKEN` (Vercel → Storage → Blob) and that is the path taken. Leave
it empty and uploads are written to `./.uploads` and served from `/api/files` instead —
behind the login, with byte-range support so seeking works. That is for building
courses on a laptop; on a serverless host the disk is read-only and vanishes with the
next deploy, which is why the **token** decides rather than `NODE_ENV`.

## Downloads: open, code-gated, or off

**Settings → Uploaded videos** (owner only). Three answers, and they are exclusive:

| | What a student gets | Cost |
| --- | --- | --- |
| **Anyone can download** | Plays straight from storage, browser's own save button | Cheapest — CDN, never touches this app |
| **Downloading needs a code** | Plays through this app; save is replaced by a button that asks for a code you issue | Your hosting bandwidth. You see who is asking |
| **No downloading at all** | Plays through this app, no download button | Your hosting bandwidth |

The two protected modes serve video through `/api/watch/<lessonId>`, and the swap
happens **on the server** — so the storage URL never reaches the browser at all. Hiding
the download button while leaving the real URL in the page would be theatre: it sits in
the network tab either way, and a blob URL works for anyone in the world who has it.

### The code, and the log

The owner mints codes on the same page. Each has a label ("Sam Rivera"), a use count
(**1 by default**, which makes it genuinely single-use) and an expiry. A code is shown
**once**, at the moment it is made — only a SHA-256 of it is stored, so there is no
screen anywhere listing what everyone's code is.

The download lives behind the **`⋯` in the corner of the video**, where a player's own
options belong — a Download button sitting in the flow of the page reads as an
invitation; tucked into a menu it reads as something available if you need it.

**Pressing it is recorded before the box even opens** — before a code is typed, and
whether or not one ever is. Somebody who sees that a code is wanted and quietly backs
out leaves no other trace, and that is exactly the person worth knowing about. The row
reads `Pressed Download`, and it is amber rather than red: showing an interest is
neither a success nor a refusal, and colouring it red would bury the rows that are.
Opening the box does **not** count toward the rate limit, so clicking six times cannot
lock anyone out. The log shows who, which lesson, which code, and what
happened: `Pressed Download`, `Downloaded`, `Wrong code`, `Code already used up`,
`Code had expired`, `Code had been withdrawn`, `Blocked — too many tries`. Admins skip the code but are
still logged, because "nobody took a copy except an admin" is only worth anything if
the admins are in the list too.

Refusals all say the same thing to the person at the box — a wrong code, a spent code
and a withdrawn code are one message — so a stranger guessing cannot learn which of
their guesses was once real. The owner sees the difference in the log.

**Five failures in ten minutes and the account stops being asked.** Blocked attempts do
*not* count toward that five, so an impatient person clicking again cannot extend their
own lockout — otherwise "try again in ten minutes" would be untrue. They are still
logged, because somebody hammering the box is exactly what the owner wants to see.

A one-time code is spent with a conditional update, so two people racing the last use
of it cannot both get through.

Accepting a code mints a **signed ticket** — a few minutes, bound to that person and
that lesson — and the browser follows it to get the file as an attachment. A ticket
belonging to somebody else, or aimed at another lesson, is simply ignored and the
response falls back to ordinary playback.

### What none of this can do

**A browser that can play a video can save it.** Someone signed in who opens the
developer tools can take the file the player is streaming, in any of the three modes —
and anyone at all can point a phone at the screen. No setting changes either; the real
answers are DRM or segmented streaming, which are a different product.

So the middle option is **friction and a paper trail**, not a lock. It stops a copy
being one click, it stops a link working for anyone outside the hub, and it puts a name
against every attempt. Worth having — just not the same as the file being safe.

Embedded videos are unaffected in every mode (YouTube and Loom play in their own
player). Attachments are unaffected too, deliberately — a workbook is meant to be
downloaded, and already needs a sign-in.

## Progress

One row per person per lesson, written only once they have actually done something.
Every percentage in the app is the same arithmetic — rows completed over lessons
visible, counted at read time in `src/lib/catalog.ts`. Nothing is denormalised onto a
user row, so a lesson added on Tuesday correctly moves everyone's figure on Tuesday.

**Only published courses count** toward a student's headline figure. A course still
being built would otherwise drag everyone down the moment you added a chapter to it.

There is deliberately **no admin action for marking someone else's lesson complete**.
The numbers on the students tab are only worth reading if the only thing that can move
them is somebody actually watching.

## Who is here right now

The Students tab shows presence beside every name — a dot and a word:

| | | |
| --- | --- | --- |
| 🟢 **Online** | pulsing | On a page and using it |
| 🟡 **Idle** | steady | Page still open, nothing touched for 5 minutes — includes a backgrounded tab |
| ⚪ **Offline** | steady | No heartbeat for over a minute |

That is *separate* from whether an account is **active or deactivated**, which is in the
Account column — a deactivated account shows "No access" rather than a presence, because
it cannot be online at all.

Every signed-in page beats once every 30 seconds and says whether the person was
interacting when it did. Two stamps on the user row — `lastSeenAt` and `lastActiveAt` —
and all three states fall out of comparing them to the clock in `src/lib/presence.ts`.

Derived rather than stored, deliberately: a closed laptop, a crashed tab and a dropped
connection all resolve to offline on their own. A stored `isOnline` flag needs something
to come along and turn it off, and that something never runs at the moment it matters.

The trade is a lag — closing a tab reads as offline about a minute later, not instantly.
Nothing is sent on the way out, because a browser tearing a page down is the least
reliable moment to ask it for a request.

The dots **decay in the browser** without a reload, so a table left open all afternoon
still tells the truth; the page re-reads itself every 30 seconds to catch people
*arriving*, and pauses that while the tab is in the background.

## Drip feeding

Per lesson, in days, counted from **the day that student's account was created** — so
someone who joins in March gets the same run-up as someone who joined in January. A
locked lesson shows the date it opens rather than a bare padlock, and asking for its
URL directly gets the same answer as clicking it. Admins are never held back.

## Running it

```bash
cp .env.example .env      # DATABASE_URL, AUTH_SECRET (32+ chars), BLOB_READ_WRITE_TOKEN
npm install
npx prisma migrate deploy
npm run dev
```

First visit lands on `/setup`, which makes the owner account and is then closed
forever. Everyone else is added from the Students tab, with a password you can read
once and send them — it is hashed on arrival and never legible again.

## Your own password

**Your name in the top-right → Change your password.** Everyone signed in has this,
including the owner — and for the owner it is the *only* route, because the Students
tab deliberately refuses to touch the owner's account or to let anyone reset their own
from there.

It asks for your current password first. That is the difference between this and the
reset an admin performs on somebody else: a reset is an authority acting on an account,
this is the account proving it is itself. Without it, a session left open on a shared
machine would be enough to take the account outright.

**Changing it signs out every other session.** A session is a signed token with a
thirty-day life, so without this a password change would do nothing about whoever is
already signed in as you — which is the one situation in which somebody changes their
password in a hurry. Any token issued before the change is refused (`passwordChangedAt`
on the user row); the session doing the changing is re-issued afterwards, so you stay
signed in where you are.

`npm run build` runs `prisma generate`, then the migrations, then `next build` — so a
deploy migrates itself.

### Deploying to Vercel

| | |
| --- | --- |
| `DATABASE_URL` | **Required.** Attach a Postgres from the Storage tab and it sets this for you |
| `AUTH_SECRET` | **Required.** 32+ characters. Sessions are signed with it |
| `BLOB_READ_WRITE_TOKEN` | Required if you upload videos — see *Where the files go* |

Set them for **Production**, and for **Preview** too if you deploy branches; a build
with none of them fails at the migration step, by design, rather than shipping an app
that cannot reach its own database.

Hosts disagree about what to call the connection string. Vercel's Postgres and Neon
integrations publish a family of `POSTGRES_*` names and may not set `DATABASE_URL` at
all — which is how a deploy ends up saying *connection url is empty* with a database
sitting right there attached to the project. `scripts/database-url.mjs` accepts any of
them, preferring a **direct** connection for migrations (they take advisory locks a
transaction-mode pooler cannot carry) and a **pooled** one for the running app.

**Uploads need Blob storage on Vercel.** There is no disk to write to, so the local
upload path refuses with a message saying so rather than writing to a `/tmp` that is
gone by the time a student opens the lesson.

## Look

Inter Extra Bold at −8% tracking on headings, the OS UI face for running text, and the
same eight tints as the other hubs. Light, dark and follow-the-system, applied before
first paint by an inline script so a dark-mode user never gets a white flash.
