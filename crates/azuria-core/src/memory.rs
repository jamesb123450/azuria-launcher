/// Installed physical memory, rounded down to a supported 256 MiB allocation.
pub fn allocation_limit(total_bytes: u64) -> Result<u32, String> {
    let mb = total_bytes / (1024 * 1024);
    let mb = mb.min(u32::MAX as u64) as u32 / 256 * 256;
    if mb < 512 {
        return Err("Could not detect enough physical memory for Minecraft.".into());
    }
    Ok(mb)
}
pub fn total_bytes() -> Result<u64, String> {
    #[cfg(windows)]
    {
        #[repr(C)]
        struct MemoryStatus {
            length: u32,
            load: u32,
            total: u64,
            available: u64,
            page: u64,
            available_page: u64,
            virtual_total: u64,
            virtual_available: u64,
            extended: u64,
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn GlobalMemoryStatusEx(status: *mut MemoryStatus) -> i32;
        }
        let mut status = MemoryStatus {
            length: std::mem::size_of::<MemoryStatus>() as u32,
            load: 0,
            total: 0,
            available: 0,
            page: 0,
            available_page: 0,
            virtual_total: 0,
            virtual_available: 0,
            extended: 0,
        };
        // SAFETY: correctly sized writable MEMORYSTATUSEX with its length initialized.
        if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 {
            return Ok(status.total);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(raw) = std::fs::read_to_string("/proc/meminfo") {
            if let Some(kib) = raw.lines().find_map(|line| {
                line.strip_prefix("MemTotal:")
                    .and_then(|s| s.split_whitespace().next())
                    .and_then(|s| s.parse::<u64>().ok())
            }) {
                return Ok(kib.saturating_mul(1024));
            }
        }
    }
    Err("Could not detect physical memory. Retry or restart Azuria.".into())
}
pub fn limit() -> Result<u32, String> {
    allocation_limit(total_bytes()?)
}
/// Validate against this computer at the native save/launch boundary.
pub fn validate(value: u32) -> Result<(), String> {
    let maximum = limit()?;
    if !(512..=maximum).contains(&value) || !value.is_multiple_of(256) {
        return Err(format!(
            "Memory must be 512–{maximum} MB in increments of 256 MB (physical memory limit)."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn follows_physical_memory_including_above_64_gib() {
        for gib in [4, 8, 16, 64, 128, 256] {
            assert_eq!(
                allocation_limit(gib * 1024_u64.pow(3)).unwrap(),
                gib as u32 * 1024
            );
        }
        assert_eq!(allocation_limit(8191 * 1024 * 1024).unwrap(), 7936);
        assert!(allocation_limit(0).is_err());
    }
}
