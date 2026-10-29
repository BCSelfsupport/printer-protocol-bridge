# Roadmap

- [x] Put usage in each printer's Messages screen; printer catalogue entries show without PC copies, named-only content reads preserve selection, and nozzle/solvent profiles persist per printer. 25 tests pass; isolated screen checked. Physical printer/full licensed navigation remains unverified.

- [x] Add Consumables ink/makeup calculator from the TCO workbook; automatic estimated message counts, no dot-source selector/manual entry, and commissioning warning. 25 tests and isolated screen checks pass. Full navigation remains licence-gated in the test browser.
- [x] Investigate existing BIN font format: three font files structurally decoded and A/B/C checked; current calculator retains accepted preview-based estimates. Remaining fonts and printer layout behavior are not yet verified or integrated.

- [x] Correct message-read fallback and font-height/template placement inconsistencies; 18 regression checks passed and What's New updated. Exact physical-printer reproduction remains unverified; preview editor access is product-key gated.

- [x] Show newly pushed emulated messages without switching printers — list regression and related transfer tests passed (12 tests); preview click-through remains product-key gated.
- [x] Retain the saved PC Library copy after every Push to Printer — successful transfer and reload retention tests passed; preview click-through remains product-key gated.
- [x] Remove PC Library swap-slot requirement and protect existing printer messages — additive transfer and same-name refusal tests passed; preview click-through remains product-key gated.
- [x] Fix all-printer selection when an emulated target does not yet contain a PC-saved message — all-13-printer regression and failure controls pass; preview click-through remains product-key gated.

- [x] Keep deleted emulated messages deleted after reload — regression tests passed.
- [x] Fix PC Library transfers to another emulated printer — cross-printer emulator test passed; preview click-through blocked by product-key screen.

- [ ] Diagnose regular CodeSync initial connection with no printer messages or readings — waiting for installed app version and FAIL tooltip/error from Andy's PC; live printer replies are unavailable in this preview.

- [x] Add missing What's New entries (left-edge fix, repeat print, firmware cable upload, offline cards, training videos)
- [x] Remove Developer Portal mentions from What's New entries (firmware, training videos, emulate toggle)
