/** Single place for the product name used inside the app. Renaming: see "Renaming" in CLAUDE.md. */
export const BRAND = {
  name: 'Ochemate',
  /** Wordmark is set in two parts: the second one is drawn in the theme accent color. */
  wordmark: { lead: 'OCHE', accent: 'MATE' },
  tagline: 'Local dart scoring. Tap the board, we do the maths.',
  /**
   * AGPL-3.0 section 13: users of a modified copy that runs as a network service must be offered its source.
   * A fork that hosts a modified version changes `repo` and `license` to its own repository.
   */
  source: {
    repo: 'https://github.com/domhirs/ochemate',
    license: 'https://github.com/domhirs/ochemate/blob/main/LICENSE',
  },
  disclaimer: 'Independent open-source project, not affiliated with or linked to any other products, brands or services.',
} as const;
