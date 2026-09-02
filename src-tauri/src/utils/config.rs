// Canonical config-directory resolution for APInox.
//
// All modules that need the config directory must call `resolve_config_dir()` from
// this module. Do NOT copy-paste the resolution logic elsewhere.

use std::path::PathBuf;

/// Process-wide lock serializing tests that swap the `APINOX_CONFIG_DIR`
/// environment variable.
///
/// `cargo test` runs tests concurrently in ONE process, and
/// `resolve_config_dir()` reads this process-global env var, so every test
/// that mutates `APINOX_CONFIG_DIR` (any module) must hold this single lock
/// for the duration of its set/restore window. Using per-module locks instead
/// lets env mutations from different modules race (see the
/// `unified_explorer_commands` vs `updater` regression this consolidates).
pub static CONFIG_DIR_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Returns the APInox config directory as a `PathBuf`.
///
/// Resolution order:
/// 1. `APINOX_CONFIG_DIR` environment variable (if set and non-empty)
/// 2. `$HOME/.apinox` (Unix) / `%USERPROFILE%\.apinox` (Windows)
///
/// Returns `Err` if neither can be determined.
pub fn resolve_config_dir() -> Result<PathBuf, String> {
    std::env::var("APINOX_CONFIG_DIR")
        .ok()
        .and_then(|dir| if dir.trim().is_empty() { None } else { Some(PathBuf::from(dir)) })
        .or_else(|| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()?;
            Some(PathBuf::from(home).join(".apinox"))
        })
        .ok_or_else(|| "Cannot determine config directory: set HOME, USERPROFILE, or APINOX_CONFIG_DIR".to_string())
}
