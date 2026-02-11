use esp32_nimble::enums::*;
use esp32_nimble::{BLEAdvertisementData, BLEDevice, BLEScan};
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::task::block_on;
use esp_idf_svc::sys::esp_timer_get_time;
use hmac::{Hmac, Mac};
use log::{error, info};
use sha2::Sha256;

// ── Protocol definitions ────────────────────────────────────────────────

/// Custom manufacturer ID used by our protocol.
const MANUFACTURER_ID: u16 = 0xFFFF;

/// Current protocol version.
const PROTOCOL_VERSION: u8 = 1;

/// Infrastructure key: shared between broadcaster and repeater.
/// Used by the broadcaster to sign, and by the repeater to verify.
/// In production, store in eFuse — assumed impossible to extract.
const HMAC_KEY_INFRA: &[u8] = b"infra-secret-key-efuse!!";

/// Client-facing key: used by the repeater to re-sign before broadcasting.
/// Clients use this key to verify notifications.
/// In production, store in eFuse on repeater; distribute to app securely.
const HMAC_KEY_CLIENT: &[u8] = b"client-secret-key-app!!!";

/// Number of bytes of the truncated HMAC-SHA256 infrastructure tag.
/// 8 bytes = 64-bit tag (strong enough for repeater-chain verification).
const HMAC_TAG_INFRA_LEN: usize = 8;

/// Number of bytes of the truncated HMAC-SHA256 client tag.
/// 4 bytes = 32-bit tag (sufficient for client-side verification,
/// saves BLE advertisement space).
const HMAC_TAG_CLIENT_LEN: usize = 4;

type HmacSha256 = Hmac<Sha256>;

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq)]
enum TransportType {
    Bus = 1,
    Train = 2,
}

impl TransportType {
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::Bus),
            2 => Some(Self::Train),
            _ => None,
        }
    }
}

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq)]
enum TransportStatus {
    Passing = 1,
    Coming = 2,
    Late = 3,
}

impl TransportStatus {
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::Passing),
            2 => Some(Self::Coming),
            3 => Some(Self::Late),
            _ => None,
        }
    }
}

#[repr(C, packed)]
#[derive(Debug, Clone, Copy)]
struct TransportNotification {
    version: u8,
    source_id: [u8; 4],
    notification_id: [u8; 4],
    /// High nibble = event_id (0–15), low nibble = destination_id (0–15).
    event_dest: u8,
    /// High nibble = transport_type, low nibble = transport_status.
    type_status: u8,
    /// How long (in seconds) this notification should be re-broadcast.
    duration_secs: u16,
    /// HMAC tag signed by the broadcaster (infrastructure key).
    /// Verified by every repeater in the chain — never modified.
    hmac_tag_infra: [u8; HMAC_TAG_INFRA_LEN],
    /// HMAC tag signed by the first repeater (client key).
    /// Verified by the client app. Set to zeroes by the broadcaster.
    hmac_tag_client: [u8; HMAC_TAG_CLIENT_LEN],
}

impl TransportNotification {
    /// Size of the full struct in bytes (including both HMAC tags).
    const SIZE: usize = core::mem::size_of::<Self>();

    /// Byte size of the base payload (everything before the two HMAC tags).
    /// This is what both HMAC tags authenticate.
    const BASE_PAYLOAD_SIZE: usize = Self::SIZE - HMAC_TAG_INFRA_LEN - HMAC_TAG_CLIENT_LEN;

    // ── Nibble accessors ────────────────────────────────────────────

    fn event_id(&self) -> u8 {
        ({ self.event_dest } >> 4) & 0x0F
    }

    fn destination_id(&self) -> u8 {
        ({ self.event_dest }) & 0x0Fu8
    }

    fn transport_type(&self) -> Option<TransportType> {
        TransportType::from_u8(({ self.type_status } >> 4) & 0x0F)
    }

    fn transport_status(&self) -> Option<TransportStatus> {
        TransportStatus::from_u8({ self.type_status } & 0x0F)
    }

    /// Return the full struct as a byte slice (for re-broadcast).
    fn as_bytes(&self) -> &[u8] {
        unsafe {
            core::slice::from_raw_parts(
                (self as *const Self) as *const u8,
                Self::SIZE,
            )
        }
    }

    /// Return only the base payload (everything before both HMAC tags).
    fn base_payload(&self) -> &[u8] {
        unsafe {
            core::slice::from_raw_parts(
                (self as *const Self) as *const u8,
                Self::BASE_PAYLOAD_SIZE,
            )
        }
    }

    /// Compute a truncated HMAC-SHA256 tag for the infrastructure key.
    fn compute_infra_tag(data: &[u8]) -> [u8; HMAC_TAG_INFRA_LEN] {
        let mut mac =
            HmacSha256::new_from_slice(HMAC_KEY_INFRA).expect("HMAC accepts any key length");
        mac.update(data);
        let result = mac.finalize().into_bytes();
        let mut tag = [0u8; HMAC_TAG_INFRA_LEN];
        tag.copy_from_slice(&result[..HMAC_TAG_INFRA_LEN]);
        tag
    }

    /// Compute a truncated HMAC-SHA256 tag for the client key.
    fn compute_client_tag(data: &[u8]) -> [u8; HMAC_TAG_CLIENT_LEN] {
        let mut mac =
            HmacSha256::new_from_slice(HMAC_KEY_CLIENT).expect("HMAC accepts any key length");
        mac.update(data);
        let result = mac.finalize().into_bytes();
        let mut tag = [0u8; HMAC_TAG_CLIENT_LEN];
        tag.copy_from_slice(&result[..HMAC_TAG_CLIENT_LEN]);
        tag
    }

    /// Verify the infrastructure HMAC tag (broadcaster → repeater chain).
    fn verify_infra(&self) -> bool {
        let expected = Self::compute_infra_tag(self.base_payload());
        expected == ({ self.hmac_tag_infra })
    }

    /// Verify the client HMAC tag (repeater → client).
    fn verify_client(&self) -> bool {
        let expected = Self::compute_client_tag(self.base_payload());
        expected == ({ self.hmac_tag_client })
    }

    /// Sign the client tag in-place (called by the first repeater).
    fn sign_client(&mut self) {
        let tag = Self::compute_client_tag(self.base_payload());
        self.hmac_tag_client = tag;
    }

    /// Returns true if the client tag has been set (non-zero).
    fn has_client_tag(&self) -> bool {
        ({ self.hmac_tag_client }) != [0u8; HMAC_TAG_CLIENT_LEN]
    }

    /// Parse and verify a notification from the manufacturer-data payload.
    /// Verifies the infrastructure HMAC tag. Returns `None` if invalid.
    fn from_payload(payload: &[u8]) -> Option<Self> {
        info!("    › parsing payload ({} bytes)", payload.len());
        if payload.len() < Self::SIZE {
            return None;
        }

        let notif: Self = unsafe {
            let ptr = payload.as_ptr() as *const Self;
            core::ptr::read_unaligned(ptr)
        };

        // Validate protocol version
        if { notif.version } != PROTOCOL_VERSION {
            return None;
        }
        // Validate packed enum nibbles
        notif.transport_type()?;
        notif.transport_status()?;

        // Verify infrastructure HMAC tag (set by broadcaster, never changes)
        if !notif.verify_infra() {
            error!("    ✗ infra HMAC mismatch — rejecting forged notification");
            return None;
        }

        Some(notif)
    }
}

// ── Active notification with expiry tracking ────────────────────────────

/// A notification we are actively re-broadcasting, with an expiry timestamp.
#[derive(Clone)]
struct ActiveNotification {
    notification: TransportNotification,
    /// Raw manufacturer-data payload (including the 2-byte company ID) for
    /// direct re-broadcast.
    raw_mfg_payload: Vec<u8>,
    /// Monotonic timestamp (in microseconds) at which this entry expires.
    expires_at_us: i64,
}

// ── Configuration ───────────────────────────────────────────────────────

/// Duration to scan for advertisements (ms).
const SCAN_DURATION_MS: i32 = 3000;

/// Duration to re-broadcast each active notification (ms).
const REBROADCAST_DURATION_MS: u32 = 2000;

/// Maximum number of notifications kept in the active list.
const MAX_ACTIVE_NOTIFICATIONS: usize = 16;

// ── Helpers ─────────────────────────────────────────────────────────────

/// Return the current monotonic time in microseconds.
fn now_us() -> i64 {
    unsafe { esp_timer_get_time() }
}

fn main() {
    // It is necessary to call this function once. Otherwise, some patches to the runtime
    // implemented by esp-idf-sys might not link properly. See https://github.com/esp-rs/esp-idf-template/issues/71
    esp_idf_svc::sys::link_patches();

    // Bind the log crate to the ESP Logging facilities
    esp_idf_svc::log::EspLogger::initialize_default();

    info!("Starting BLE Station Repeater...");
    info!(
        "Scan {}ms → re-broadcast each for {}ms → repeat",
        SCAN_DURATION_MS, REBROADCAST_DURATION_MS
    );

    let ble_device = BLEDevice::take();
    let advertiser = ble_device.get_advertising();

    // Persistent list of notifications we are currently re-broadcasting.
    let mut active: Vec<ActiveNotification> = Vec::new();

    loop {
        // ── Prune expired notifications ─────────────────────────────────
        let now = now_us();
        let before = active.len();
        active.retain(|n| n.expires_at_us > now);
        let pruned = before - active.len();
        if pruned > 0 {
            info!("Pruned {} expired notification(s)", pruned);
        }

        // ── Phase 1: Scan ───────────────────────────────────────────────
        info!(
            "── Scanning for {} ms (active list: {}) ──",
            SCAN_DURATION_MS,
            active.len()
        );

        let new_notifications: Vec<ActiveNotification> = block_on(async {
            let mut scanner = BLEScan::new();
            scanner
                .active_scan(true)
                .interval(100)
                .window(99);

            let mut found: Vec<ActiveNotification> = Vec::new();

            let _ = scanner
                .start(ble_device, SCAN_DURATION_MS, |device, data| {
                    // Only look at advertisements with our manufacturer ID
                    if let Some(mfg) = data.manufacture_data() {
                        if mfg.company_identifier == MANUFACTURER_ID {
                            if let Some(notif) =
                                TransportNotification::from_payload(mfg.payload)
                            {
                                let sid = { notif.source_id };
                                let nid = { notif.notification_id };
                                let dur = { notif.duration_secs };

                                info!(
                                    "  ✓ verified notification {:02X}{:02X}{:02X}{:02X} from station {:02X}{:02X}{:02X}{:02X} \
                                     ({:?} {:?} → dest {}) duration {}s via {:?} (RSSI {})",
                                    nid[0], nid[1], nid[2], nid[3],
                                    sid[0], sid[1], sid[2], sid[3],
                                    notif.transport_type().unwrap(),
                                    notif.transport_status().unwrap(),
                                    notif.destination_id(),
                                    dur,
                                    device.addr(),
                                    device.rssi(),
                                );

                                // Relay all valid notifications with a non-zero duration
                                if dur > 0 {
                                    let mut notif = notif;

                                    // First repeater signs the client tag;
                                    // subsequent repeaters pass it through unchanged.
                                    if !notif.has_client_tag() {
                                        notif.sign_client();
                                        info!("    → signed client HMAC tag");
                                    }

                                    // Re-broadcast: company ID + full struct (both tags)
                                    let mut raw = Vec::new();
                                    raw.extend_from_slice(
                                        &MANUFACTURER_ID.to_le_bytes(),
                                    );
                                    raw.extend_from_slice(notif.as_bytes());

                                    let expires =
                                        now_us() + (dur as i64) * 1_000_000;

                                    found.push(ActiveNotification {
                                        notification: notif,
                                        raw_mfg_payload: raw,
                                        expires_at_us: expires,
                                    });
                                }
                            }
                        }
                    }
                    None::<()> // keep scanning
                })
                .await;

            found
        });

        // ── Merge new notifications into active list ────────────────────
        for new in new_notifications {
            // If we already have this notification_id, update its expiry
            let new_nid = { new.notification.notification_id };
            if let Some(existing) = active
                .iter_mut()
                .find(|a| { a.notification.notification_id } == new_nid)
            {
                existing.expires_at_us = new.expires_at_us;
                existing.notification = new.notification;
                existing.raw_mfg_payload = new.raw_mfg_payload;
                info!("  updated notification {:02X}{:02X}{:02X}{:02X} expiry", new_nid[0], new_nid[1], new_nid[2], new_nid[3]);
            } else if active.len() < MAX_ACTIVE_NOTIFICATIONS {
                info!("  added notification {:02X}{:02X}{:02X}{:02X} to active list", new_nid[0], new_nid[1], new_nid[2], new_nid[3]);
                active.push(new);
            } else {
                error!("  active list full, dropping notification");
            }
        }

        if active.is_empty() {
            info!("No active notifications to broadcast.");
            FreeRtos::delay_ms(500);
            continue;
        }

        // ── Phase 2: Re-broadcast all active notifications ──────────────
        info!(
            "── Re-broadcasting {} active notification(s) ──",
            active.len()
        );

        for (i, entry) in active.iter().enumerate() {
            let mut adv = advertiser.lock();

            // Stop any previous advertising
            let _ = adv.stop();

            // Non-connectable, non-scannable — pure beacon repeat
            adv.advertisement_type(ConnMode::Non);
            adv.scan_response(false);

            // Fast advertising interval (~20 ms)
            const INTERVAL: u16 = 32; // 32 × 0.625 ms = 20 ms
            adv.min_interval(INTERVAL);
            adv.max_interval(INTERVAL);

            let mut adv_data = BLEAdvertisementData::new();
            adv_data.manufacturer_data(&entry.raw_mfg_payload);

            if let Err(e) = adv.set_data(&mut adv_data) {
                error!("  [{}] failed to set adv data: {:?}", i, e);
                continue;
            }

            if let Err(e) = adv.start() {
                error!("  [{}] failed to start advertising: {:?}", i, e);
                continue;
            }

            let remaining_secs =
                (entry.expires_at_us - now_us()).max(0) / 1_000_000;
            let esid = { entry.notification.source_id };
            let enid = { entry.notification.notification_id };
            info!(
                "  [{}] notification {:02X}{:02X}{:02X}{:02X} from station {:02X}{:02X}{:02X}{:02X} ({:?} {:?}) — expires in {}s",
                i,
                enid[0], enid[1], enid[2], enid[3],
                esid[0], esid[1], esid[2], esid[3],
                entry.notification.transport_type().unwrap_or(TransportType::Bus),
                entry.notification.transport_status().unwrap_or(TransportStatus::Passing),
                remaining_secs
            );

            // Keep this advertisement active for a short burst
            FreeRtos::delay_ms(REBROADCAST_DURATION_MS);

            let _ = adv.stop();
        }

        info!("── Cycle complete ──\n");
    }
}
