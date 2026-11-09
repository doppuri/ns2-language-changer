# Switch 2 mutable language experiment — PRIVATE source candidate

**Not a GitHub release and not validated for general use.** This is a locally integrated source tree based on the *actual* trial configuration, not a patch on pristine upstream. The pinned upstream `pepsipu/ns2jb` commit `95f5525089273c5fce0b95047f3600f8442e96ae` had no tracked license when checked on 2026-11-09. The owner has asked to bundle its upstream-derived source as in a GitHub source-and-ZIP release, without contacting the author; see [THIRD-PARTY.md](THIRD-PARTY.md) for provenance. **Do not upload this current private candidate:** remaining hardware/scratch gates and final publication audit are not complete.

## What the scripts change

The scripts target **mutable system settings**, not hardware region identity, calibration/PRODINFO, account country, firmware, or network/DNS settings. The source-bound FS-context bridge obtains the authorized `set` getter and `set:sys` setter. Commands and payloads:

| Purpose | Service, command | Payload/readback |
|---|---|---|
| Read LanguageCode | `set`, `0` | 8-byte NUL-terminated language code, canonicalized before writing |
| Read RegionCode | `set`, `4` | little-endian 32-bit enum |
| Verify firmware language mapping | `set`, `2` | enum `0` → `ja\0`; enum `1` → `en-US\0` |
| Set LanguageCode | `set:sys`, `0` | canonical 8 bytes: `6a61000000000000` (`ja`) or `656e2d5553000000` (`en-US`) |
| Set RegionCode | `set:sys`, `57` | little-endian `00000000` (Japan) or `01000000` (American region) |

`english`: requires region `0`, language `ja`; checks a same-value region write first; writes region `1`, reads it back, then writes `en-US` and reads it back. `restore`: requires region `1`, language `en-US`; checks same-value `1`; writes `ja` and reads it back, then writes region `0` and reads it back. That Japanese-first restoration order matches the two observed successful live round trips. A setter's possible admission is journaled **before** dispatch; ambiguous results are not retried. Failure after a target write attempts one rollback to the original values and reports uncertainty if rollback cannot be verified. Both operations intentionally keep the target after successful readback. Neither claims an English/Japanese HOME screen without separate imagery.

## Where the integration sits

- `bootstrap.bas`: the exact trial SmileBASIC 4.4.9 bootstrap with pointer/hash/CRC checks and FW-specific function offsets. It does not contain an account, console key or device identifier. A *different* firmware or SmileBASIC build is not supported by swapping a single arbitrary offset.
- `engine/lib/` and `engine/shared/`: the upstream-derived host bridge, protocol and SDK reference data.
- `engine/switch2/app/`, `memory/`, `retained/`, `ro/`, and `process/`: the **actual successful trial's modified acquisition, retention, FS memory IPC, and native payload tree**. Do not replace these with pristine upstream files. The observed English-settings run's executed acquisition and setting files were SHA-bound in `FULL-SOURCE-RELEASE-BOUNDARY-20261109.md` in the parent directory.
- `engine/switch2/ro/region-same-value.cjs`: one candidate change selects region `0` or `1` for the same-value prerequisite according to the requested mode. `region-language-roundtrip.cjs` is the original successful English setting stage. `region-language-restore.cjs` is a **new, host-tested but not console-tested** reverse stage.
- `engine/switch2/pipeline.cjs`: one candidate change chooses the English or reverse stage, while leaving the acquisition and retirement sequence in place. `run.cjs` selects a local-network host IP dynamically and checks the local source tree, and `admission.cjs` records one attempt per claimed OS boot. The packaged host scripts no longer depend on the owner's private boot-pins file. **Operator confirmations are not independent console telemetry.**
- `engine/switch2/ro/english-active-home.cjs` and `english-active-capture.cjs` are fail-closed compatibility placeholders: the original English stage imports the former as an unused default argument. Historical absolute HDMI paths and HOME routes have been removed; neither helper sends input or captures an image. An independent, current-scene observation is still required.

Read [EVIDENCE.md](EVIDENCE.md) for run-level versus setting-level proof, [THIRD-PARTY.md](THIRD-PARTY.md) for provenance, and [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for remaining gates.

## Host-only preflight

With Node.js 22+ installed, `node run.cjs --check-only` hashes the candidate source tree and opens **no** console connection. Host test command: `node --test admission.test.cjs engine/switch2/ro/region-language-restore.test.cjs engine/switch2/ro/region-language-roundtrip.test.cjs engine/switch2/ro/region-same-value.test.cjs`.

The provisional command shapes are `node enable-english.cjs --admission admission.json [computer-IP]` and `node restore-japanese.cjs --admission admission.json [computer-IP]` (or `node run.cjs --mode english|restore ...`). **Do not use them on a console yet**: there is no validated general-user scene witness or exact-owned scratch-recovery tool. An admission JSON would contain precisely `bootId`, `mode`, and four `true` confirmations: `confirmedFreshOsBoot`, `confirmedNoPendingOwnedScratch`, `confirmedSavedNs2`, `confirmedStartUnused`. The launcher consumes the boot ID before opening a listener; it refuses unresolved prior runs, but it cannot prove that the human claims are true. Do not invent a fresh boot ID to retry on the same OS boot. A pending 51-node save scratch needs raw-bound, nonrecursive, exact-owned cleanup on a **distinct** boot; no prefix-wide deletion. Run logs can contain private console data; never upload them.

## Evidence and remaining gates

The separate private `../private-eiadix-cleanup/` module now provides a source-bound, host-tested 51-node **same-save** cleanup core, a mounted-SAVE adapter and a pre-boot-refusing stage (10/10 tests); it has no independently boot-bound cleanup-only runner, and has not removed scratch. The older save-only cleaner assumes a different mount arrangement and is unsafe for this run.

**Japanese restoration of the mutable settings has been demonstrated:** the earlier real runs `switch2-USy2I1` and `switch2-UFdgPh` both wrote `ja` then region `0` and read back both original values; an interrupted `switch2-Cb2mZo` run also recorded `ABORT_RESTORED` with both readbacks. Those runs were overall unsuccessful for separate pipeline/cleanup reasons; they do not prove that the *new wrapper* has run on a console. The successful English-setting trial (`switch2-eiadiX`) read back RegionCode `1` and LanguageCode `en-US`; an unedited image showed **English System Settings**. Its immediate HOME screen remained Japanese. Full-OS reboot persistence, second-device compatibility, this assembled runner's live behavior, the new standalone reverse mode's on-console behavior, and the private trial's 51-node scratch cleanup are **not** established. Its top-level result was `verified:false` despite the setting readback. Host tests are not a substitute for these checks. Keep the console offline/90DNS as configured; this candidate never requests Nintendo online access or modifies factory identity.

Before a real all-in-one public release: finish exact-owned cleanup and a fresh-boot run on this assembled candidate; independently verify the wrapper and reboot persistence (historical Japanese restoration is already evidenced); audit private data and file-by-file source/payload provenance, retain upstream attribution and record the owner's redistribution decision, then review the final archive and publication destination. No push, tag, release, or public ZIP has been made here.
