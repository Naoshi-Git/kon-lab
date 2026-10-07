# still — design decisions, 2026-10-07

## Current agreed design

Black background, off-white digits with a static split, date and weekday. Hours/minutes/seconds horizontally in landscape; smaller seconds below hours/minutes in portrait. Minimal English-only interface. Japanese instructions open in another tab through ?, with the actual UI embedded in an isolated demonstration mode.

Focus and Measure remain independent controls. Tap to start/pause/resume; hold while paused to reset. Focus duration changes by vertical swipe before starting. Default 25m focus and 5m rest; manual transition after silent completion.

Stay starts automatically and offers no manual controls. All non-visible periods stop credit. Absences up to 30 seconds preserve the current session; longer absences reset it and returning starts a new one. The earlier manual sleep mode is superseded.

Stay ring fills for 5m, erases for the next 5m, and repeats. Each completed interval earns one dot. At 30m all six dots briefly fold into a cycle badge, then a fresh set starts. Completed cycle count remains below the orb. Central elapsed time updates only by minute in m/h notation. TODAY (all sessions combined) and LONGEST (longest single session today) retain quantitative feedback across resets. Timer numeral/status pairs are optically centered together; fixed slots prevent status changes from moving the digits. Stay retains a centered single-line number.

## Implementation

Static HTML/CSS/JavaScript, no external dependencies. One-second timer cadence, no rendering while hidden, time-difference accounting for timers. Ring interpolation uses CSS; text nodes update only when their contents change. Fixed-width tabular numerals avoid moving the surrounding layout. Reduced-motion settings disable ring interpolation and collection animation.

Daily Stay records remain under the v2 record key; automatic sessions use a new v3 key to prevent old sleeping sessions from bypassing the absence rule. Local midnight divides credited time between days. Short absences preserve session continuity without adding hidden time.

## Changed-file manifest and publication

Owning repository: https://github.com/Naoshi-Git/kon-lab.git

Scope: still/index.html, style.css, app.js, help.html, sw.js, manifest.webmanifest, README.md, DESIGN.md. Existing icon.svg remains a required asset. The existing unrelated change to the repository's root index.html is preserved.

Proposed public URL: https://naoshi-git.github.io/kon-lab/still/

Before public publishing: review scoped changes and staged filenames, inspect Pages configuration and repository status, and obtain user confirmation under the workspace publishing rule. User authorized public publishing on 2026-10-07. Deployment uses gh-pages, preserving the existing public homepage and adding a still link.

## Remaining validation

Real iPhone/iPad layout, touch gestures, visibility/lock behavior, offline caching and wake lock remain unverified. Battery use has not been measured. Web visibility events cannot reliably distinguish screen lock from app switching.




## Responsive verification update

2026-10-07: iPhone 17-equivalent 402×874 and 874×402, iPad mini-equivalent 744×1133 and 1133×744 checked with Chromium viewport emulation. Simulated safe areas: iPhone portrait top 62/bottom 34; landscape sides 62/bottom 21; iPad top 24/bottom 20. These are test assumptions, not guarantees about every OS version.

Orbs now scale to approximately 109/97px on iPhone and 141/136px on iPad mini portrait/landscape. Header controls have 44×44px hit regions. Header safe-area padding is additive; standalone display includes conservative fallbacks when environment insets report zero. Verified no content overflow in these layouts and unchanged stopwatch numeral coordinates when toggling pause. Real Safari/PWA validation remains necessary for hardware-specific status bars and wake lock.

## Landing page addition

Scope: landing.html, landing.css, landing.js; help.html navigation; service-worker asset list; README and design notes; the existing still entry in Kon-Lab's public homepage links to the landing page. Clock remains directly available at /still/.

Direction: spare black/off-white editorial design, Japanese prose, oversized clock imagery and honest demonstrations of the five-minute fill/erase cycle. Address the user's "ドパガキ対応" brief as a product mechanism for staying instead of seeking the next stimulus, without describing medical treatment or guaranteed behavior change. Public delivery follows the existing user authorization for this still project.

## Preview fidelity repair

Landing hero and cycle demo now use the actual application DOM, rings, dots, numeral/status positions and collection animation. Help uses the same runtime. Shared preview-controller.js sends seeks/pause commands and reflects elapsed time from the embedded app; it does not run a second time source. DEMO does not read or write saved records. The iframe layout uses a fixed canvas with hidden overflow and removes the main application's minimum-height/media-rule conflicts. Verify real-time 29:30 → 30:00 collection and no inner scrolling at phone/tablet sizes before deployment.

2026-10-07 repair: single-Stay embedded orb explicitly uses 240px instead of inheriting the compact 88px rule. Cycle badges are positioned out of layout flow, so all three orb coordinates stay unchanged across a milestone. Six filled dots collect for 1.2 seconds before the completed-cycle badge/count is revealed. Chromium observation confirmed six dots with badge hidden during collection, then ×1, with identical orb y coordinates before/during/after. Phone-width Stay iframe fits a 240px circle within a 310px canvas. Landing columns also respond to narrow device presentation.
