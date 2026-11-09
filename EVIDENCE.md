# What has actually been observed

This document separates the proven *settings operations* from the new
all-in-one wrapper. It contains no private console logs or pairing material.

- Real `switch2-USy2I1` and `switch2-UFdgPh` runs changed mutable settings
  from Japan/`ja` to region 1/`en-US`, then wrote `ja` and region 0 and read
  both originals back. Their setting reports ended with
  `LANGUAGE_AND_REGION_ROUNDTRIP_RESTORED`; both overall host runs failed at
  later/other stages, so this does not certify the launcher or FS cleanup.
- A third interrupted run `switch2-Cb2mZo` ended its setting stage with
  `ABORT_RESTORED`, also recording both original values on readback.
- `switch2-eiadiX` read back region 1/`en-US` and an independent HDMI image
  showed English System Settings. HOME immediately afterward remained Japanese.
  This run's top-level result was not verified because 51 exact-owned save
  scratch nodes remained. The later private cleanup-only run `switch2-XYz7IW`
  removed exactly those 51 nodes, committed, and verified root absence from a
  newly cloned SAVE (pipeline/result both `verified:true`); this does not
  retroactively turn the English-setting run into a verified all-in-one run.
  Following owner-authorized terms acceptance and a separately witnessed OS
  restart, fresh HDMI showed both HOME and System Settings in Japanese.
  English Settings UI **did not persist in that observed reboot path**.
  On a subsequent independently witnessed full OS reboot, a separate
  app-only, read-only `set` getter probe read RegionCode **1** and
  LanguageCode **ja** twice (private receipt SHA-256
  `e24a388152013d920380d26591f537ff558a2886ef6c6c23dea54071fbd44a39`).
  No setter or FS acquisition was attempted in that probe. This proves the
  mixed mutable state at that later observation, not which reboot caused the
  language reversion or any hardware SKU change.
- The acquisition/bootstrap/native payload in this tree derive from that
  exact English-settings trial. The executed acquisition probe SHA-256 is
  `428939bd5ed1798533f862c09fac1b863cf38cac85ed9a5bd8026ccc3e284e6e`;
  the executed English stage SHA-256 is
  `5813772586945d36a00771b822d410366ed3adf7d8ce4330ac22c872a47cbedc`.
  The new standalone reverse stage follows the historical Japanese-first
  setter order for `1`/`en-US`, and adds a host-tested no-language-write
  branch for `1`/`ja`. These source additions follow the prior console trials;
  the console results above come from their individually identified runs.

Host tests cover preflight/rollback logic; the console results above are
from the individually identified trials. The live-proven *private,
exact-eiadiX-owned* cleanup runner lives outside this source candidate and is
not a user-facing cleanup command.
The added `recovery/` library derives an exact SAVE tree from a **new** run's
SHA-bound raw and producer and checks content/foreign nodes before journaled
nonrecursive cleanup. Synthetic host tests pass; there is no live recovery CLI,
independent current-boot admission, or fresh-SAVE absence proof for a new run.
The integrated English/restore wrapper is distributed here as experimental
source; the observations above identify the earlier console stages precisely.
