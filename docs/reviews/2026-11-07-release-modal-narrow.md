# 1.3 release proposal: narrow-screen correction

The owner approved the first two 390px light/dark screenshots and rejected the
tall narrow version. Approval is limited to those designs, not a release or
merge. Revised narrow approval remains pending.

## Design and implementation

Figure 4.7c (`design/mockups/release-1.3-narrow.html`) was rendered and inspected
before code. Below 375px, featured announcements use 8px horizontal gutters,
16px inner padding, 22px header and 18px feature title. Tighter spacing and
two footer actions in one row reduce height. The redundant introductory phrase
is omitted at this width; all feature and minor-entry text/links remain.
GOT IT stays on one line. Controls retain at least 44px height. Short viewports
keep a scrollable middle and visible header/footer. Ordinary dialogs, release
history and unfeatured announcements retain their layout.

No capture, storage, connector, auth or acknowledgment behavior changed. The
review-only proposal still never acknowledges a release. Guide/claims add the
existing short-screen scrolling behavior in simple user-facing terms.

## Local evidence

Actual components were rendered in a temporary loopback fixture with fictional
data and no hosted account. The fixture was restored and the server stopped.

| Viewport | Card width × height | Content height / scroll height |
|---|---|---|
| 320×740 before | 288×708 | 353 / 406 |
| 320×740 after | 304×579 | 341 / 341 |
| 360×740 after | 344×559 | 321 / 321 |
| 320×480 after | 304×448 | 211 / 341 |

No horizontal overflow or page errors. Close, notes and GOT IT stay in the
viewport with 44px minimum height. Inner scrolling exposes the minor entry on
the short viewport, and GOT IT dismisses. Before/after PNG SHA-256 values
match exactly at 390×844 light, 390×844 dark, 375×844 light and 768×900 light.
Thus the approved wider designs and breakpoint boundary are unchanged in the
local actual-component comparison. These checks do not establish physical
iOS behavior or hosted signed-in functionality.

Typecheck and 167 release/version/Guide tests pass locally. React checklist:
no new effects, data fetches, component definitions or dependencies; existing
focus, escape and close handlers are retained. The new dialog prop defaults
to false. The signed-in proposal test now checks narrow geometry, full content
at 740px, 44px targets, short-screen scrolling and the 375px breakpoint.

Signed-in synthetic loopback-Supabase CI, immutable preview identity and the
review screenshot delivery will be recorded after the implementation commit.
The existing N84 sign-in/navigation flake remains open. Registry/package stay
1.2.1, staging 1.3.0. No DB changes, production health-data writes or promotion.
