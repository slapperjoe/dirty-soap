/// Template variable substitution.
///
/// Replaces `{{varName}}` and `${varName}` placeholders with values from the map.
/// Supports both syntaxes so templates written for either convention work correctly.
pub fn substitute_variables(template: &str, variables: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();
    // Sort keys by length descending so "fooBar" is substituted before "foo",
    // preventing shorter keys from matching inside longer key names.
    let mut keys: Vec<&String> = variables.keys().collect();
    keys.sort_by_key(|k| -(k.len() as isize));
    for key in keys {
        let value = &variables[key];
        result = result.replace(&format!("{{{{{}}}}}", key), value);
        result = result.replace(&format!("${{{}}}", key), value);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_double_brace_substitution() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "World".to_string());
        assert_eq!(substitute_variables("Hello {{name}}!", &vars), "Hello World!");
    }

    #[test]
    fn test_dollar_brace_substitution() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "World".to_string());
        assert_eq!(substitute_variables("Hello ${name}!", &vars), "Hello World!");
    }

    #[test]
    fn test_multiple_variables() {
        let mut vars = HashMap::new();
        vars.insert("a".to_string(), "foo".to_string());
        vars.insert("b".to_string(), "bar".to_string());
        assert_eq!(substitute_variables("{{a}} and ${b}", &vars), "foo and bar");
    }

    #[test]
    fn test_no_match_unchanged() {
        let vars = HashMap::new();
        assert_eq!(substitute_variables("no vars here", &vars), "no vars here");
    }
}
