use super::*;
use regex::Regex;
pub fn allowed(rules: &Value, custom_resolution: bool) -> Result<bool, String> {
    if rules.is_null() {
        return Ok(true);
    }
    let mut allowed = false;
    for rule in rules.as_array().ok_or("Invalid library rule list.")? {
        let mut matches = true;
        if let Some(os) = rule.get("os") {
            if os["name"].as_str().is_some_and(|name| name != "windows") {
                matches = false;
            }
            for (field, value) in [("arch", "amd64"), ("version", "10.0")] {
                if let Some(pattern) = os[field].as_str() {
                    if pattern.len() > 256 {
                        return Err("Game metadata rule is too long.".into());
                    }
                    let regex =
                        Regex::new(pattern).map_err(|_| "Unsupported game metadata rule.")?;
                    matches &= regex.is_match(value);
                }
            }
        }
        if let Some(features) = rule["features"].as_object() {
            for (feature, enabled) in features {
                let actual = feature == "has_custom_resolution" && custom_resolution;
                matches &= enabled.as_bool() == Some(actual);
            }
        }
        if matches {
            allowed = match rule["action"].as_str() {
                Some("allow") => true,
                Some("disallow") => false,
                _ => return Err("Unknown game rule action.".into()),
            };
        }
    }
    Ok(allowed)
}
pub fn substitute(args: Vec<String>, vars: &BTreeMap<&str, String>) -> Result<Vec<String>, String> {
    args.into_iter()
        .map(|arg| {
            let mut remaining = arg.as_str();
            let mut output = String::new();
            while let Some(start) = remaining.find("${") {
                output.push_str(&remaining[..start]);
                let rest = &remaining[start + 2..];
                let end = rest
                    .find('}')
                    .ok_or("Malformed launch argument placeholder.")?;
                let value = vars
                    .get(&rest[..end])
                    .ok_or("This version uses launch arguments Azuria does not support yet.")?;
                output.push_str(value);
                remaining = &rest[end + 1..];
            }
            output.push_str(remaining);
            Ok(output)
        })
        .collect()
}

pub fn arguments(
    value: &Value,
    vars: &BTreeMap<&str, String>,
    custom_resolution: bool,
) -> Result<Vec<String>, String> {
    let mut result = vec![];
    for arg in value.as_array().ok_or("Missing game launch arguments.")? {
        if let Some(value) = arg.as_str() {
            result.push(value.into());
        } else if allowed(&arg["rules"], custom_resolution)? {
            match &arg["value"] {
                Value::String(v) => result.push(v.clone()),
                Value::Array(values) => {
                    for value in values {
                        result.push(value.as_str().ok_or("Invalid launch argument.")?.into());
                    }
                }
                _ => return Err("Unsupported game argument value.".into()),
            }
        }
    }
    substitute(result, vars)
}
