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
  scratch nodes remained. A reboot-persistence result has not been established.
- The acquisition/bootstrap/native payload in this tree derive from that
  exact English-settings trial. The executed acquisition probe SHA-256 is
  `428939bd5ed1798533f862c09fac1b863cf38cac85ed9a5bd8026ccc3e284e6e`;
  the executed English stage SHA-256 is
  `5813772586945d36a00771b822d410366ed3adf7d8ce4330ac22c872a47cbedc`.
  The new standalone reverse stage follows the historical Japanese-first
  setter order, but the assembled wrapper and this stage have **not** run
  together on a console.

Source-only tests establish preflight/rollback logic, not new-console
compatibility. The local exact-owned cleanup prototype lives outside this
source candidate and is not a user-facing cleanup command.
