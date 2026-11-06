# Changelog

All notable changes to Ochemate. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Data export and import under Settings > Data: download all players and matches as one JSON file, and upload it on another instance (new server, development copy). Import replaces all players and matches; voices and device settings are not included. `DATA_IMPORT=off` disables import.

## [0.3.0] - 2026-11-02

### Added

- Settings > About shows the build of the running image (branch or tag and commit), so a test instance on `edge` is recognisable.
- `OCHEMATE_PORT` in `.env` sets the published host port (default 8080), so a second instance fits on the same Docker host.
- Fullscreen button in the top right corner of the board (hides the browser bars; works over plain HTTP).

### Changed

- Rematch rotates the player order: two players swap, with more players the next one in line starts.
- Game selection shows "X01" instead of "301 / 501", since 701 is offered too.

## [0.2.0] - 2026-11-02

### Added

- Edit throws in game history and in running games.
- Show the total of each player's latest visit.

## [0.1.1] - 2026-11-01

### Fixed

- Match ids no longer break on plain HTTP (no `crypto.randomUUID()` outside secure contexts).

## [0.1.0] - 2026-11-01

### Added

- X01, Cricket and Around the Clock on a tap-to-score SVG dartboard.
- Match history with stats, saved players, themes and custom voices.
- Prebuilt image on GHCR with semver tags.

[Unreleased]: https://github.com/domhirs/ochemate/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/domhirs/ochemate/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/domhirs/ochemate/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/domhirs/ochemate/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/domhirs/ochemate/releases/tag/v0.1.0
