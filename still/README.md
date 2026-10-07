# still — clock & focus

Black and off-white clock with Focus, Measure, and automatic Stay. No ads, analytics, external fonts, or libraries.

## Interaction

- Focus: tap to start/pause/resume; hold while paused to reset. Swipe before starting to set 1–120 minutes. Default: 25-minute focus, 5-minute break. Tap to start the next phase after silent completion.
- Measure: tap to start/pause/resume; hold while paused to reset.
- Stay: automatic, display only. Five-minute fill then five-minute erase; one dot per interval. Six dots collect into a cycle badge every thirty minutes. Central elapsed time updates once per minute, using m/h.
- Leaving for up to 30 seconds preserves Stay continuity without crediting hidden time. Longer absences reset the current session; return automatically starts a new one. Screen lock follows the same rule. No manual sleep or reset.
- TODAY is the sum of all stay sessions today; LONGEST is the longest single session today. Both persist locally. Dates follow the device's local time; visible time crossing midnight is split between dates.
- The header wake-lock icon requests screen wake lock. The ? link opens Japanese instructions with an interactive copy of the actual UI in a separate tab.

See [help.html](help.html) for user instructions and [DESIGN.md](DESIGN.md) for design decisions.

## Delivery

Serve this directory over HTTPS via GitHub Pages. Add to Home Screen in Safari for standalone use. A service worker stores static assets after the first successful visit for offline use. Direct file opening supports the clock and timers but not service-worker caching; local-storage and wake-lock behavior depends on the browser.

Stay sessions use the v3 local-storage key; previous manual/sleep sessions are not restored. Existing daily records are preserved. Focus and Measure reset on reload.

Responsive layout checked in Chromium at iPhone 17-equivalent 402×874 / 874×402 and iPad mini-equivalent 744×1133 / 1133×744, with simulated safe-area padding. Verified no layout overflow, 44px header targets, and stable stopwatch numeral positions across RUNNING/PAUSED. Actual iOS/iPadOS rendering, wake-lock behavior, touch gestures, and battery consumption remain unverified on-device. Published through the repository gh-pages branch at https://naoshi-git.github.io/kon-lab/still/.




