/**
 * EagleEye UI foundation
 * UI-only layer. Backend/API/DB contracts remain unchanged.
 *
 * BJにゃん assets are mapped by semantic UI state so page implementations
 * can choose a mascot intentionally instead of coupling to numeric filenames.
 */
export const EAGLEEYE_BJNYAN = Object.freeze({
  normal: "/assets/eagleeye/bjnyan/001_normal.png",
  processing: "/assets/eagleeye/bjnyan/002_processing.png",
  success: "/assets/eagleeye/bjnyan/003_success.png",
  warning: "/assets/eagleeye/bjnyan/004_warning.png",
  error: "/assets/eagleeye/bjnyan/005_error.png",
  updating: "/assets/eagleeye/bjnyan/006_updating.png",
  maintenance: "/assets/eagleeye/bjnyan/007_maintenance.png",
  waiting: "/assets/eagleeye/bjnyan/008_waiting.png",
  searching: "/assets/eagleeye/bjnyan/009_searching.png",
  dataFetching: "/assets/eagleeye/bjnyan/010_data_fetching.png",
  ranking: "/assets/eagleeye/bjnyan/011_ranking_check.png",
  player: "/assets/eagleeye/bjnyan/012_player_research.png",
  kingdom: "/assets/eagleeye/bjnyan/013_kingdom_research.png",
  watchlist: "/assets/eagleeye/bjnyan/014_watchlist_monitoring.png",
  growth: "/assets/eagleeye/bjnyan/015_growth_found.png",
  change: "/assets/eagleeye/bjnyan/016_change_found.png",
  notification: "/assets/eagleeye/bjnyan/017_notification.png",
  saving: "/assets/eagleeye/bjnyan/018_saving.png",
  syncing: "/assets/eagleeye/bjnyan/019_syncing.png",
  noData: "/assets/eagleeye/bjnyan/020_no_data.png",
  dataComplete: "/assets/eagleeye/bjnyan/021_data_complete.png",
  recovery: "/assets/eagleeye/bjnyan/022_recovery.png",
  allGreen: "/assets/eagleeye/bjnyan/023_all_green.png",
  errorAnalysis: "/assets/eagleeye/bjnyan/024_error_analysis.png",
  report: "/assets/eagleeye/bjnyan/025_report.png",
  system: "/assets/eagleeye/bjnyan/026_system_monitoring.png",
  login: "/assets/eagleeye/bjnyan/027_login.png",
  permissionDenied: "/assets/eagleeye/bjnyan/028_permission_denied.png",
  connectionError: "/assets/eagleeye/bjnyan/029_connection_error.png",
  newData: "/assets/eagleeye/bjnyan/030_new_data.png",
  help: "/assets/eagleeye/bjnyan/031_help.png",
  finished: "/assets/eagleeye/bjnyan/032_finished.png",
  dashboard: "/assets/eagleeye/bjnyan/033_dashboard.png",
  analysis: "/assets/eagleeye/bjnyan/034_analysis.png",
  checklist: "/assets/eagleeye/bjnyan/035_checklist.png",
  observation: "/assets/eagleeye/bjnyan/036_observation.png",
  network: "/assets/eagleeye/bjnyan/037_network_status.png",
  repair: "/assets/eagleeye/bjnyan/038_system_repair.png",
  review: "/assets/eagleeye/bjnyan/039_data_review.png",
  celebration: "/assets/eagleeye/bjnyan/040_celebration.png"
});

export const EAGLEEYE_UI_SEMANTIC = Object.freeze({
  home: "dashboard",
  ranking: "ranking",
  playerSearch: "player",
  kingdomSearch: "kingdom",
  playerWatchlist: "watchlist",
  kingdomWatchlist: "watchlist",
  systemStatus: "system",
  dataFetching: "dataFetching",
  analysis: "analysis",
  network: "network",
  success: "success",
  warning: "warning",
  error: "error",
  changeFound: "change",
  growthFound: "growth"
});

/**
 * Shared design tokens for the new EagleEye UI.
 * Existing pages can adopt these incrementally; no global layout replacement
 * happens here, which keeps parallel feature development safe.
 */
export const EAGLEEYE_UI_TOKENS = Object.freeze({
  colors: {
    navy: "#081324",
    panel: "#0f1f35",
    panelRaised: "#162a45",
    border: "#27425f",
    text: "#e5f2ff",
    subtext: "#94a3b8",
    cyan: "#22d3ee",
    blue: "#60a5fa",
    gold: "#fcd34d",
    success: "#22c55e",
    warning: "#fbbf24",
    error: "#ef4444"
  },
  mascotMaxWidth: 236
});
