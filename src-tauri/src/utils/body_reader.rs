use std::io::Write;
use std::path::PathBuf;

use anyhow::{Context, Result};
use bytes::Bytes;
use futures_util::StreamExt;
use hyper::body::Incoming;
use http_body_util::BodyExt;
use tempfile::NamedTempFile;

const SPOOL_DIR: &str = "/tmp/apinox-spool";

/// A request body that may have been partially spooled to disk.
pub struct SpooledBody {
    pub prefix: Bytes,
    pub overflow_file: Option<PathBuf>,
}

impl SpooledBody {
    /// Read the complete body into memory, cleaning up any temp file.
    pub async fn into_bytes(mut self) -> Result<Vec<u8>> {
        let overflow = std::mem::take(&mut self.overflow_file);
        let prefix = std::mem::take(&mut self.prefix);
        match overflow {
            None => Ok(prefix.to_vec()),
            Some(path) => {
                let disk_part = tokio::fs::read(&path).await
                    .with_context(|| format!("Failed to read spooled body from {}", path.display()))?;
                tokio::fs::remove_file(&path).await.ok();
                let mut out = Vec::with_capacity(prefix.len() + disk_part.len());
                out.extend_from_slice(&prefix);
                out.extend_from_slice(&disk_part);
                Ok(out)
            }
        }
    }
}

impl Drop for SpooledBody {
    fn drop(&mut self) {
        if let Some(ref path) = self.overflow_file {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Read the incoming request body, spooling to disk if it exceeds `max_body_bytes`.
/// When `max_body_bytes` is `None`, the entire body is read into memory (backward compatible).
pub async fn read_body(body: Incoming, max_body_bytes: Option<u64>) -> Result<SpooledBody> {
    match max_body_bytes {
        None => {
            let collected = body
                .collect()
                .await
                .context("Failed to read request body")?;
            Ok(SpooledBody {
                prefix: collected.to_bytes(),
                overflow_file: None,
            })
        }
        Some(limit) => {
            let limit = limit as usize;
            let mut stream = body.into_data_stream();
            let mut mem_buf = Vec::with_capacity(limit.min(65536));
            let mut total: usize = 0;
            let mut overflow_path: Option<PathBuf> = None;

            while let Some(frame_result) = stream.next().await {
                let frame = frame_result.context("Failed to read body frame")?;
                if !frame.is_empty() {
                    let chunk: &[u8] = frame.as_ref();
                    let chunk_len = chunk.len();
                    total += chunk_len;

                    if overflow_path.is_none() {
                        if total <= limit {
                            mem_buf.extend_from_slice(chunk);
                        } else {
                            let space_left = limit - mem_buf.len();
                            let in_mem_part = &chunk[..space_left];
                            let disk_part = &chunk[space_left..];
                            mem_buf.extend_from_slice(in_mem_part);

                            std::fs::create_dir_all(SPOOL_DIR)
                                .context("Failed to create spool directory")?;
                            let tmp = NamedTempFile::new_in(SPOOL_DIR)
                                .context("Failed to create spool temp file")?;
                            let path = tmp.path().to_path_buf();
                            let mut file = tmp.as_file();
                            file.write_all(disk_part)
                                .context("Failed to write spool overflow")?;
                            file.flush()
                                .context("Failed to flush spool overflow")?;
                            // Convert to TempPath so it persists beyond this scope
                            let _ = tmp.into_temp_path();
                            overflow_path = Some(path);
                        }
                    } else {
                        let ref_path = overflow_path.as_ref().unwrap();
                        let mut file = tokio::fs::OpenOptions::new()
                            .append(true)
                            .open(ref_path)
                            .await
                            .context("Failed to open spool file for append")?;
                        tokio::io::AsyncWriteExt::write_all(&mut file, chunk)
                            .await
                            .context("Failed to write spool overflow chunk")?;
                    }
                }
            }

            Ok(SpooledBody {
                prefix: Bytes::from(mem_buf),
                overflow_file: overflow_path,
            })
        }
    }
}
