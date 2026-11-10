/** Matcha Momentum Generator's home: its public repo (README, releases, issues), the Help menu link. */
export const HOME_URL = 'https://github.com/curyantony-code/matcha-momentum-generator'
/** Settings > "Get a newer version": the releases page, where new installers are posted. */
export const UPDATE_PAGE_URL = `${HOME_URL}/releases`
/** The daily "is there a newer version?" check (main/update-check.ts) stays off: Matcha Momentum Generator has no update server of its
 * own yet, and the one in update-check.ts is upstream Reel Studio's. Turn on only with your own server there. */
export const UPDATE_CHECK_ON = false
/** Upstream Reel Studio's site: only update-check.ts's dormant defaults use it (Matcha Momentum Generator is a fork, MIT). */
export const SITE_URL = 'https://getreelstudio.com'

/** "Install it myself": each vendor's own install page for the person's own AI app (Connect Claude / Connect ChatGPT). */
export const VENDOR_INSTALL_PAGES = {
  claude: 'https://code.claude.com/docs/en/setup',
  chatgpt: 'https://learn.chatgpt.com/docs/codex/cli'
} as const
/** Where a Claude plan is upgraded (the free plan does not include the Claude Code app). */
export const CLAUDE_PLANS_URL = 'https://claude.ai/upgrade'
