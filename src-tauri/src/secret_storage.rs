use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use crate::utils::resolve_config_dir;

const SECRET_REFERENCE_PREFIX: &str = "__SECRET__:";
const ALGORITHM_IV_SIZE: usize = 12; // GCM nonce size

/// Encrypted secrets storage
#[derive(Debug, Serialize, Deserialize, Default)]
struct SecretsData {
    secrets: HashMap<String, String>,
}

/// Get path to encryption key file
fn get_key_path() -> Result<PathBuf, String> {
    let config_dir = resolve_config_dir()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    Ok(config_dir.join(".key"))
}

/// Get path to encrypted secrets file
fn get_secrets_path() -> Result<PathBuf, String> {
    let config_dir = resolve_config_dir()?;

    Ok(config_dir.join("secrets.enc"))
}

/// Get or create encryption key.
///
/// # Security Note
///
/// The key is stored on disk as a plaintext hex string with `chmod 600`
/// permissions on Unix.  This means any process running as the same user
/// can read the key, which is sufficient to decrypt the secrets file.
///
/// Future work should integrate with the OS keychain / credential manager
/// (macOS Keychain, Windows DPAPI, freedesktop Secret Service) so that
/// the unwrapped key never sits in a plain file on disk.
fn get_or_create_key() -> Result<[u8; 32], String> {
    // Check environment variable first
    if let Ok(env_key) = std::env::var("APINOX_SECRET_KEY") {
        let key_bytes = hex::decode(env_key)
            .map_err(|e| format!("Invalid encryption key in environment: {}", e))?;
        if key_bytes.len() != 32 {
            return Err("Encryption key must be 32 bytes (64 hex chars)".to_string());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        return Ok(key);
    }

    // Check for key file
    let key_path = get_key_path()?;
    if key_path.exists() {
        let key_hex = fs::read_to_string(&key_path)
            .map_err(|e| format!("Failed to read key file: {}", e))?;
        let key_bytes = hex::decode(key_hex.trim())
            .map_err(|e| format!("Invalid key file format: {}", e))?;
        if key_bytes.len() != 32 {
            return Err("Key file must contain 32 bytes (64 hex chars)".to_string());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        return Ok(key);
    }

    // Generate new key
    log::info!("Generating new encryption key at: {:?}", key_path);
    let key: [u8; 32] = rand::thread_rng().gen();
    let key_hex = hex::encode(key);
    
    // Write with restricted permissions (Unix-like systems)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::write(&key_path, &key_hex)
            .map_err(|e| format!("Failed to write key file: {}", e))?;
        let mut perms = fs::metadata(&key_path)
            .map_err(|e| format!("Failed to get key file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&key_path, perms)
            .map_err(|e| format!("Failed to set key file permissions: {}", e))?;
    }
    
    // Windows doesn't have same permission model
    #[cfg(not(unix))]
    {
        fs::write(&key_path, &key_hex)
            .map_err(|e| format!("Failed to write key file: {}", e))?;
    }

    Ok(key)
}

/// Load encrypted secrets from disk
fn load_secrets() -> Result<HashMap<String, String>, String> {
    let secrets_path = get_secrets_path()?;
    
    if !secrets_path.exists() {
        return Ok(HashMap::new());
    }

    let key = get_or_create_key()?;
    let cipher = Aes256Gcm::new(&key.into());

    let encrypted = fs::read(&secrets_path)
        .map_err(|e| format!("Failed to read secrets file: {}", e))?;

    if encrypted.len() < ALGORITHM_IV_SIZE + 16 {
        log::warn!("Secrets file too small, starting with empty secrets");
        return Ok(HashMap::new());
    }

    // Extract IV (nonce), auth tag, and encrypted data
    let nonce_bytes = &encrypted[0..ALGORITHM_IV_SIZE];
    let encrypted_data = &encrypted[ALGORITHM_IV_SIZE..];

    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, encrypted_data)
        .map_err(|e| format!("Failed to decrypt secrets: {}", e))?;

    let data: SecretsData = serde_json::from_slice(&decrypted)
        .map_err(|e| format!("Failed to parse secrets JSON: {}", e))?;

    Ok(data.secrets)
}

/// Save encrypted secrets to disk
fn save_secrets(secrets: &HashMap<String, String>) -> Result<(), String> {
    let secrets_path = get_secrets_path()?;
    let key = get_or_create_key()?;
    let cipher = Aes256Gcm::new(&key.into());

    let data = SecretsData {
        secrets: secrets.clone(),
    };

    let json = serde_json::to_string(&data)
        .map_err(|e| format!("Failed to serialize secrets: {}", e))?;

    // Generate random nonce (IV)
    let nonce_bytes: [u8; ALGORITHM_IV_SIZE] = rand::thread_rng().gen();
    let nonce = Nonce::from_slice(&nonce_bytes);

    let encrypted = cipher
        .encrypt(nonce, json.as_bytes())
        .map_err(|e| format!("Failed to encrypt secrets: {}", e))?;

    // Combine nonce + encrypted data (encrypted includes auth tag)
    let mut output = Vec::with_capacity(ALGORITHM_IV_SIZE + encrypted.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&encrypted);

    // Write with restricted permissions
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::write(&secrets_path, &output)
            .map_err(|e| format!("Failed to write secrets file: {}", e))?;
        let mut perms = fs::metadata(&secrets_path)
            .map_err(|e| format!("Failed to get secrets file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&secrets_path, perms)
            .map_err(|e| format!("Failed to set secrets file permissions: {}", e))?;
    }

    #[cfg(not(unix))]
    {
        fs::write(&secrets_path, &output)
            .map_err(|e| format!("Failed to write secrets file: {}", e))?;
    }

    Ok(())
}

/// Format key for environment secret
fn format_key(env_name: &str, field_name: &str) -> String {
    format!("env:{}:{}", env_name, field_name)
}

/// Create secret reference for config storage
fn create_reference(env_name: &str, field_name: &str) -> String {
    format!("{}env:{}:{}", SECRET_REFERENCE_PREFIX, env_name, field_name)
}

/// Check if value is a secret reference
fn is_secret_reference(value: &str) -> bool {
    value.starts_with(SECRET_REFERENCE_PREFIX)
}

/// Store an environment secret
#[tauri::command]
pub async fn store_secret(env_name: String, field_name: String, value: String) -> Result<String, String> {
    let key = format_key(&env_name, &field_name);
    let mut secrets = load_secrets()?;
    secrets.insert(key, value);
    save_secrets(&secrets)?;
    
    // Return reference string for config storage
    Ok(create_reference(&env_name, &field_name))
}

/// Retrieve an environment secret
#[tauri::command]
pub async fn get_secret(env_name: String, field_name: String) -> Result<Option<String>, String> {
    let key = format_key(&env_name, &field_name);
    let secrets = load_secrets()?;
    Ok(secrets.get(&key).cloned())
}

/// Delete an environment secret
#[tauri::command]
pub async fn delete_secret(env_name: String, field_name: String) -> Result<(), String> {
    let key = format_key(&env_name, &field_name);
    let mut secrets = load_secrets()?;
    secrets.remove(&key);
    save_secrets(&secrets)?;
    Ok(())
}

/// Resolve a value - if it's a secret reference, decrypt it
#[tauri::command]
pub async fn resolve_secret_value(value: String) -> Result<String, String> {
    if !is_secret_reference(&value) {
        return Ok(value);
    }

    // Extract key from reference (remove prefix)
    let key = &value[SECRET_REFERENCE_PREFIX.len()..];
    let secrets = load_secrets()?;
    
    Ok(secrets.get(key).cloned().unwrap_or(value))
}

/// Check if value is a secret reference
#[tauri::command]
pub async fn is_secret_ref(value: String) -> Result<bool, String> {
    Ok(is_secret_reference(&value))
}

/// List all secret keys (for debugging/management)
#[tauri::command]
pub async fn list_secret_keys() -> Result<Vec<String>, String> {
    let secrets = load_secrets()?;
    Ok(secrets.keys().cloned().collect())
}
