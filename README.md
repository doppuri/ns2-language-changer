# Switch 2 mutable language experiment — all-in-one source prerelease

**Experimental source, not a validated general-use tool.** Prior English-setting and Japanese-restoration stages were tested on a console; the newly assembled all-in-one launcher has not run end-to-end. This is the full integrated source tree based on the *actual* trial configuration, not a patch on pristine upstream. The upstream-derived source is attributed to `pepsipu/ns2jb` commit `95f5525089273c5fce0b95047f3600f8442e96ae`; see [THIRD-PARTY.md](THIRD-PARTY.md) for provenance. **Do not treat the prerelease or passing host tests as a working general-use tool:** assembled launcher, new-run scratch recovery and persistence gates remain unverified.

## What the scripts change

The scripts target **mutable system settings**, not hardware region identity, calibration/PRODINFO, account country, firmware, or network/DNS settings. The source-bound FS-context bridge obtains the authorized `set` getter and `set:sys` setter. Commands and payloads:

| Purpose | Service, command | Payload/readback |
|---|---|---|
| Read LanguageCode | `set`, `0` | 8-byte NUL-terminated language code, canonicalized before writing |
| Read RegionCode | `set`, `4` | little-endian 32-bit enum |
| Verify firmware language mapping | `set`, `2` | enum `0` → `ja\0`; enum `1` → `en-US\0` |
| Set LanguageCode | `set:sys`, `0` | canonical 8 bytes: `6a61000000000000` (`ja`) or `656e2d5553000000` (`en-US`) |
| Set RegionCode | `set:sys`, `57` | little-endian `00000000` (Japan) or `01000000` (American region) |

`english`: requires region `0`, language `ja`; checks a same-value region write first; writes region `1`, reads it back, then writes `en-US` and reads it back. `restore`: requires stable region `1` with language `en-US` **or** `ja`, checks a same-value region `1` write first, writes `ja` only if originally `en-US`, then writes region `0` and reads back region `0`/`ja`. The Japanese-first `en-US` path matches two earlier live round trips; the observed post-reboot mixed `1`/`ja` branch is host-tested but not console-tested. A setter's possible admission is journaled **before** dispatch; ambiguous results are not retried. Failure after a target write attempts one rollback to the original values and reports uncertainty if rollback cannot be verified. Both operations intentionally keep the target after successful readback. Neither claims an English/Japanese HOME screen without separate imagery.

## Where the integration sits

- `bootstrap.bas`: the exact trial SmileBASIC 4.4.9 bootstrap with pointer/hash/CRC checks and FW-specific function offsets. It does not contain an account, console key or device identifier. A *different* firmware or SmileBASIC build is not supported by swapping a single arbitrary offset.
- `engine/lib/` and `engine/shared/`: the upstream-derived host bridge, protocol and SDK reference data.
- `engine/switch2/app/`, `memory/`, `retained/`, `ro/`, and `process/`: the **actual successful trial's modified acquisition, retention, FS memory IPC, and native payload tree**. Do not replace these with pristine upstream files. The executed acquisition and setting-file SHA-256 digests are recorded in [EVIDENCE.md](EVIDENCE.md).
- `engine/switch2/ro/region-same-value.cjs`: one candidate change selects region `0` or `1` for the same-value prerequisite according to the requested mode. `region-language-roundtrip.cjs` is the original successful English setting stage. `region-language-restore.cjs` is a **new, host-tested but not console-tested** reverse stage.
- `engine/switch2/pipeline.cjs`: one candidate change chooses the English or reverse stage, while leaving the acquisition and retirement sequence in place. `run.cjs` selects a local-network host IP dynamically and checks the local source tree, and `admission.cjs` records one attempt per claimed OS boot. The packaged host scripts no longer depend on the owner's private boot-pins file. **Operator confirmations are not independent console telemetry.**
- `engine/switch2/ro/english-active-home.cjs` and `english-active-capture.cjs` are fail-closed compatibility placeholders: the original English stage imports the former as an unused default argument. Historical absolute HDMI paths and HOME routes have been removed; neither helper sends input or captures an image. An independent, current-scene observation is still required.

`recovery/` now includes the source-only, host-tested **future-run SAVE scratch** planner, exact-tree/file-byte validator, nonrecursive cleanup core and mounted-SAVE adapter. They bind an actual run's raw SHA to the pinned producer SHA, reject foreign children, and journal each possible removal before dispatch. **There is no console recovery CLI or live boot/peer/lease binding in this package.** Calling these libraries or seeing an acknowledged commit does *not* establish fresh SAVE clone absence; the result reports it false until independently checked. Do not invoke them manually against a live console or reuse an old run's raw receipt. This narrows an engineering gap but does not clear the live cleanup/release gate.

Read [EVIDENCE.md](EVIDENCE.md) for run-level versus setting-level proof, [THIRD-PARTY.md](THIRD-PARTY.md) for provenance, and [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for remaining gates.

## Host-only preflight

With Node.js 22+ installed, `node run.cjs --check-only` hashes the candidate source tree and opens **no** console connection. Host test command: `node --test admission.test.cjs recovery/recovery.test.cjs $(find engine -name '*.test.cjs' | sort)`.

The provisional command shapes are `node enable-english.cjs --admission admission.json [computer-IP]` and `node restore-japanese.cjs --admission admission.json [computer-IP]` (or `node run.cjs --mode english|restore ...`). **Do not use them on another console yet**: the assembled wrapper has not been tested live, and the private exact-owned recovery runner is bound to this owner's run rather than a general-user recovery tool. An admission JSON would contain precisely `bootId`, `mode`, and four `true` confirmations: `confirmedFreshOsBoot`, `confirmedNoPendingOwnedScratch`, `confirmedSavedNs2`, `confirmedStartUnused`. The launcher consumes the boot ID before opening a listener; it refuses unresolved prior runs, but it cannot prove that the human claims are true. Do not invent a fresh boot ID to retry on the same OS boot. A pending 51-node save scratch needs raw-bound, nonrecursive, exact-owned cleanup on a **distinct** boot; no prefix-wide deletion. Run logs can contain private console data; never upload them.

## Evidence and remaining gates

A separate owner-private module used an independently verified reboot, a one-use cleanup-only START, the exact-owned 51-node **same-SAVE** cleaner, commit and a fresh SAVE clone to prove absence. The private `switch2-XYz7IW` result and cleanup pipeline both report `verified:true`, `removed:51`, `freshSaveAbsenceVerified:true`, with source/run pins retained privately. This is not a general-user recovery tool. The older save-only cleaner assumes a different mount arrangement and remains unsafe for this run.

**Japanese restoration of the mutable settings has been demonstrated:** the earlier real runs `switch2-USy2I1` and `switch2-UFdgPh` both wrote `ja` then region `0` and read back both original values; an interrupted `switch2-Cb2mZo` run also recorded `ABORT_RESTORED` with both readbacks. Those runs were overall unsuccessful for separate pipeline/cleanup reasons; they do not prove that the *new wrapper* has run on a console. The successful English-setting trial (`switch2-eiadiX`) read back RegionCode `1` and LanguageCode `en-US`; an unedited image showed **English System Settings**. Its immediate HOME screen remained Japanese. After the owner-authorized terms confirmation and independently witnessed full reboot, both HOME and System Settings were visibly **Japanese**. On a *subsequent* independently witnessed full OS reboot, a separate app-only `set` getter probe read **RegionCode `1` and LanguageCode `ja` twice**, with no setter or FS acquisition (private receipt SHA-256 `e24a388152013d920380d26591f537ff558a2886ef6c6c23dea54071fbd44a39`). This proves that the English language code did not survive that observed reboot sequence, while the mutable region remained `1` at the later read. It does not isolate exactly which reboot reverted the language. The observed mixed state (`1`, `ja`) failed both original assembled modes. This revision adds a host-tested mixed-state restore branch; it has not been live-validated and must not be claimed to have normalized the console. Second-device compatibility, this assembled runner's live behavior, and the new standalone reverse mode's on-console behavior remain **unverified**. The original eiadiX result was `verified:false` despite its earlier setting readback; its owned scratch was subsequently cleared by the separate verified cleanup-only run. Host tests are not a substitute for these checks. Keep the console offline/90DNS as configured; this candidate never requests Nintendo online access or modifies factory identity.

Before labeling this a working all-in-one release: live-test the mixed (`1`, `ja`) recovery with explicit rollback to its actual original values and new raw-bound exact-owned scratch cleanup; test assembled forward/reverse on separately witnessed boots; diagnose the language reset without treating UI text as a getter; audit private data and file-by-file source/payload provenance, retain upstream attribution, then review the final archive and publication destination. A published source prerelease is not proof that its assembled launcher works on other consoles.

---

## 日本語での説明

### この配布物について

これはSwitch 2の**可変な本体設定の地域コードと言語コード**を調べるための、英語化・日本語復元コードを含む**全部入りソースの実験版**です。英語の説明と同じソースを指します。工場出荷時の地域情報、PRODINFO、シリアル番号、証明書、鍵、アカウントの国、DNS、本体更新を変更するものではありません。国内版のSKU制限解除や任天堂オンライン利用が可能になるとは主張しません。

対象として観測した組み合わせは**本体FW 23.0.1／SmileBASIC 4.4.9**です。別の本体・ビルドでの動作保証はなく、オフライン／90DNSを保ってください。`bootstrap.bas`、取得・保持処理、native payload、`enable-english.cjs`／`restore-japanese.cjs` を同じソースツリーに収めています。上流由来コードは `pepsipu/ns2jb` のコミット `95f5525089273c5fce0b95047f3600f8442e96ae` に由来します。出典は [THIRD-PARTY.md](THIRD-PARTY.md) を参照してください。

### 何を読み書きするか

FS-contextのブリッジ経由で、`set` の `GetLanguageCode`（コマンド0）・`GetRegionCode`（4）と `MakeLanguageCode`（2）を確認し、`set:sys` の `SetLanguageCode`（0）・`SetRegionCode`（57）を使います。英語化は **地域0／`ja` → 地域1／`en-US`**、復元は **地域1／`en-US` または地域1／`ja` → 地域0／`ja`** を意図します。地域1／`en-US` の復元は先に言語を `ja` に戻し、次に地域を0にします。地域1／`ja` では不要な言語書込みを省きます。書込み前に一回限りの試行を記録し、応答が不明な書込みを推測で再送しません。成功判定はゲッターの読戻しであり、HOMEや再起動後の表示の保証ではありません。

### 実機で確認済みのこと／未確認のこと

以前の実機試行 `switch2-eiadiX` では地域1／`en-US` を読戻し、英語の**本体設定**を画面で確認しました。ただし直後のHOMEは日本語でした。`switch2-USy2I1` と `switch2-UFdgPh` の設定段階では `ja` → 地域0の順に書き戻し、両値を読戻しました。別の清掃専用実行では以前のSAVE scratch 51件を所有範囲に限定して削除・commitし、新しいSAVE cloneから不存在を確認しています。これらは**実機の結果**です。

一方、このリポジトリで**新たに組み立てた起動スクリプト全体**と、地域1／`ja`からの新しい復元分岐は、まだ実機で通し実行していません。別の再起動後の読取り専用観測では地域1／`ja`を2回確認しており、英語表示の再起動後の持続性も未証明です。過去の51件の清掃を、これからの実行で発生するscratchの清掃済み証拠として流用しないでください。[EVIDENCE.md](EVIDENCE.md) と [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) に区別を記録しています。

### 事前確認と安全上の制限

Node.js 22以降で `node run.cjs --check-only` を実行すると、ソースを検査するだけで本体に接続せず、STARTも送信しません。ホストテストは `node --test admission.test.cjs recovery/recovery.test.cjs $(find engine -name '*.test.cjs' | sort)` です。これは**実機動作テストの代わりではありません**。

本体操作では完全なOS起動ごとにSTARTは一度だけです。使ったか不明なSTARTや入力を再送しないでください。`admission.json` の自己申告は独立した起動・画面・接続先の証明ではありません。現時点では、新しい実行のSAVE scratchについて `recovery/` に所有rawへ拘束する検査・削除コアはありますが、一般ユーザー向けの実機清掃コマンド、別起動の照合、新しいSAVE cloneでの不存在確認は揃っていません。**このプレリリースをそのまま本体で動かす手順として案内しません。**失敗時は実行フォルダーを保全し、未知のSAVEファイルを消さず、ログ・接続token・端末固有情報を公開Issueへ貼らないでください。
