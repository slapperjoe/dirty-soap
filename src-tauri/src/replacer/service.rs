use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::proxy_models::ReplaceRule;

/// In-memory store for replace rules with pre-compiled regex cache.
#[derive(Debug, Default)]
pub struct ReplacerService {
    pub rules: Vec<ReplaceRule>,
    /// Pre-compiled regexes keyed by rule id, only for regex-mode rules.
    regex_cache: HashMap<String, regex::Regex>,
    /// Regex compilation errors keyed by rule id.
    regex_errors: HashMap<String, String>,
}

pub type SharedReplacerService = Arc<Mutex<ReplacerService>>;

pub fn new_shared() -> SharedReplacerService {
    Arc::new(Mutex::new(ReplacerService::default()))
}

impl ReplacerService {
    pub fn get_rules(&self) -> Vec<ReplaceRule> {
        self.rules.clone()
    }

    pub fn add_rule(&mut self, rule: ReplaceRule) {
        self.regex_errors.remove(&rule.id);
        if rule.is_regex {
            match regex::Regex::new(&rule.match_pattern) {
                Ok(re) => {
                    self.regex_cache.insert(rule.id.clone(), re);
                }
                Err(e) => {
                    self.regex_errors.insert(rule.id.clone(), e.to_string());
                }
            }
        }
        self.rules.push(rule);
    }

    pub fn update_rule(&mut self, id: &str, updated: ReplaceRule) -> bool {
        if let Some(r) = self.rules.iter_mut().find(|r| r.id == id) {
            self.regex_cache.remove(id);
            self.regex_errors.remove(id);
            if updated.is_regex {
                match regex::Regex::new(&updated.match_pattern) {
                    Ok(re) => {
                        self.regex_cache.insert(updated.id.clone(), re);
                    }
                    Err(e) => {
                        self.regex_errors.insert(updated.id.clone(), e.to_string());
                    }
                }
            }
            *r = updated;
            true
        } else {
            false
        }
    }

    pub fn delete_rule(&mut self, id: &str) -> bool {
        let len_before = self.rules.len();
        self.rules.retain(|r| r.id != id);
        self.regex_cache.remove(id);
        self.regex_errors.remove(id);
        self.rules.len() != len_before
    }

    /// Replace all rules at once (e.g. on config load).
    pub fn set_rules(&mut self, rules: Vec<ReplaceRule>) {
        self.regex_cache.clear();
        self.regex_errors.clear();
        for rule in &rules {
            if rule.is_regex {
                match regex::Regex::new(&rule.match_pattern) {
                    Ok(re) => {
                        self.regex_cache.insert(rule.id.clone(), re);
                    }
                    Err(e) => {
                        self.regex_errors.insert(rule.id.clone(), e.to_string());
                    }
                }
            }
        }
        self.rules = rules;
    }

    /// Retrieve regex compilation errors keyed by rule ID.
    pub fn get_rule_errors(&self) -> HashMap<String, String> {
        self.regex_errors.clone()
    }

    /// Apply active rules to text, filtered by context ("request" or "response").
    /// Rules with target "both" or matching context are applied.
    pub fn apply_to(&self, text: &str, context: &str) -> String {
        let total = self.rules.len();
        let eligible: Vec<_> = self.rules.iter().filter(|r| {
            if !r.active {
                return false;
            }
            let t = r.match_type.as_str();
            t == "both" || t == context || t.is_empty()
        }).collect();

        // Only log when there is something to act on
        if !eligible.is_empty() {
            log::debug!("[Replacer] context='{}' — {} eligible of {} rules", context, eligible.len(), total);
        }

        if text.is_empty() {
            return text.to_string();
        }

        let mut out = text.to_string();
        for rule in &eligible {
            let before = out.clone();
            out = apply_rule(&out, rule, self.regex_cache.get(&rule.id));
            if out != before {
                log::info!("[Replacer] Rule '{}' matched and replaced text (context={})", rule.name, context);
            } else {
                log::debug!("[Replacer] Rule '{}' (pattern='{}') — no match in text", rule.name, rule.match_pattern);
            }
        }
        out
    }

    /// Apply rules for request body context.
    pub fn apply_request(&self, text: &str) -> String {
        self.apply_to(text, "request")
    }

    /// Apply rules for response body context.
    pub fn apply_response(&self, text: &str) -> String {
        self.apply_to(text, "response")
    }

    /// Apply all active rules regardless of target context ("both").
    pub fn apply(&self, text: &str) -> String {
        self.apply_to(text, "both")
    }

}

fn apply_rule(text: &str, rule: &ReplaceRule, cached_re: Option<&regex::Regex>) -> String {
    if rule.is_regex {
        if let Some(re) = cached_re {
            return re.replace_all(text, rule.replace_with.as_str()).into_owned();
        }
        match regex::Regex::new(&rule.match_pattern) {
            Ok(re) => re.replace_all(text, rule.replace_with.as_str()).into_owned(),
            Err(e) => {
                log::warn!("[ReplacerService] Invalid regex '{}': {}", rule.match_pattern, e);
                text.to_string()
            }
        }
    } else {
        text.replace(&rule.match_pattern, &rule.replace_with)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proxy_models::ReplaceRule;

    fn rule(id: &str, pattern: &str, replace_with: &str, is_regex: bool) -> ReplaceRule {
        ReplaceRule {
            id: id.to_string(),
            name: id.to_string(),
            active: true,
            match_type: "both".to_string(),
            match_pattern: pattern.to_string(),
            replace_with: replace_with.to_string(),
            is_regex,
            xpath: None,
        }
    }

    fn inactive_rule(id: &str, pattern: &str) -> ReplaceRule {
        ReplaceRule {
            id: id.to_string(),
            name: id.to_string(),
            active: false,
            match_type: "both".to_string(),
            match_pattern: pattern.to_string(),
            replace_with: "REPLACED".to_string(),
            is_regex: false,
            xpath: None,
        }
    }

    // --- Plain text replacement ---

    #[test]
    fn plain_text_replace() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "hello", "world", false));
        assert_eq!(svc.apply("say hello there"), "say world there");
    }

    #[test]
    fn plain_text_replace_multiple_occurrences() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "foo", "bar", false));
        assert_eq!(svc.apply("foo and foo"), "bar and bar");
    }

    #[test]
    fn plain_text_no_match_unchanged() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "xyz", "abc", false));
        assert_eq!(svc.apply("hello world"), "hello world");
    }

    // --- Regex replacement ---

    #[test]
    fn regex_replace() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", r"\d{3}-\d{2}-\d{4}", "XXX-XX-XXXX", true));
        assert_eq!(svc.apply("SSN: 123-45-6789"), "SSN: XXX-XX-XXXX");
    }

    #[test]
    fn regex_replace_multiple() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", r"\d+", "N", true));
        assert_eq!(svc.apply("item 42 costs 99"), "item N costs N");
    }

    #[test]
    fn invalid_regex_leaves_text_unchanged() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", r"[invalid", "X", true));
        assert_eq!(svc.apply("hello [invalid pattern"), "hello [invalid pattern");
    }

    // --- Inactive rules are skipped ---

    #[test]
    fn inactive_rule_not_applied() {
        let mut svc = ReplacerService::default();
        svc.add_rule(inactive_rule("r1", "hello"));
        assert_eq!(svc.apply("hello world"), "hello world");
    }

    // --- Rules applied in order ---

    #[test]
    fn rules_applied_in_order() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "foo", "bar", false));
        svc.add_rule(rule("r2", "bar", "baz", false));
        assert_eq!(svc.apply("foo"), "baz");
    }

    // --- CRUD operations ---

    #[test]
    fn add_and_get_rule() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "a", "b", false));
        assert_eq!(svc.get_rules().len(), 1);
        assert_eq!(svc.get_rules()[0].id, "r1");
    }

    #[test]
    fn update_rule() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "old", "out", false));
        let updated = rule("r1", "new", "out2", false);
        assert!(svc.update_rule("r1", updated));
        assert_eq!(svc.get_rules()[0].match_pattern, "new");
    }

    #[test]
    fn update_nonexistent_rule_returns_false() {
        let mut svc = ReplacerService::default();
        assert!(!svc.update_rule("nope", rule("nope", "x", "y", false)));
    }

    #[test]
    fn delete_rule() {
        let mut svc = ReplacerService::default();
        svc.add_rule(rule("r1", "a", "b", false));
        assert!(svc.delete_rule("r1"));
        assert!(svc.get_rules().is_empty());
    }

    #[test]
    fn delete_nonexistent_returns_false() {
        let mut svc = ReplacerService::default();
        assert!(!svc.delete_rule("ghost"));
    }
}
