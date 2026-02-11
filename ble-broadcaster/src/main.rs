use bluer::adv::Advertisement;
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;
use std::collections::BTreeMap;
use std::time::Duration;
use uuid::Uuid;

const NOTIFICATION_COUNT: usize = 5;

// ── Protocol definitions ────────────────────────────────────────────────

/// Custom manufacturer ID used by our protocol.
const MANUFACTURER_ID: u16 = 0xFFFF;

/// Current protocol version.
const PROTOCOL_VERSION: u8 = 1;

/// Infrastructure key: shared between broadcaster and repeater.
/// Used by the broadcaster to sign, and by the repeater to verify.
/// In production, store in eFuse — assumed impossible to extract.
const HMAC_KEY_INFRA: &[u8] = b"infra-secret-key-efuse!!";


/// Number of bytes of the truncated HMAC-SHA256 infrastructure tag.
/// 8 bytes = 64-bit tag (strong enough, fits BLE payload).
const HMAC_TAG_INFRA_LEN: usize = 8;

/// Number of bytes of the truncated HMAC-SHA256 client tag.
/// 4 bytes = 32-bit tag (compact, set by first repeater).
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

    /// Compute a truncated HMAC-SHA256 tag of `N` bytes over the given data.
    fn compute_tag<const N: usize>(key: &[u8], data: &[u8]) -> [u8; N] {
        let mut mac =
            HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(data);
        let result = mac.finalize().into_bytes();
        let mut tag = [0u8; N];
        tag.copy_from_slice(&result[..N]);
        tag
    }

    /// Verify the infrastructure HMAC tag (broadcaster → repeater chain).
    fn verify_infra(&self) -> bool {
        let expected: [u8; HMAC_TAG_INFRA_LEN] =
            Self::compute_tag(HMAC_KEY_INFRA, self.base_payload());
        expected == ({ self.hmac_tag_infra })
    }

    /// Returns true if the client tag has been set (non-zero).
    fn has_client_tag(&self) -> bool {
        ({ self.hmac_tag_client }) != [0u8; HMAC_TAG_CLIENT_LEN]
    }

    /// Parse and verify a notification from the manufacturer-data payload.
    /// Verifies the infrastructure HMAC tag. Returns `None` if invalid.
    fn from_payload(payload: &[u8]) -> Option<Self> {
        println!("  ▶ Parsing notification from payload ({} B)", payload.len());
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
            println!("    ✗ infra HMAC mismatch — rejecting forged notification");
            return None;
        }

        Some(notif)
    }
}

/// Build a random TransportNotification with a valid HMAC tag.
fn random_notification() -> TransportNotification {
    let mut rng = rand::thread_rng();

    let transport_type = if rng.gen_bool(0.5) {
        TransportType::Bus
    } else {
        TransportType::Train
    };

    let status = match rng.gen_range(0u8..3) {
        0 => TransportStatus::Passing,
        1 => TransportStatus::Coming,
        _ => TransportStatus::Late,
    };

    // Generate a UUID v4 and take the first 4 bytes as a 32-bit short UUID.
    let notif_uuid = Uuid::new_v4();
    let mut notification_id = [0u8; 4];
    notification_id.copy_from_slice(&notif_uuid.as_bytes()[..4]);

    // Generate a UUID v4 and take the first 4 bytes as the station source_id.
    let source_uuid = Uuid::new_v4();
    let mut source_id = [0u8; 4];
    source_id.copy_from_slice(&source_uuid.as_bytes()[..4]);

    // Pack event_id (high nibble) and destination_id (low nibble) into one byte.
    let event_id: u8 = rng.gen_range(0..=15);
    let destination_id: u8 = rng.gen_range(0..=15);
    let event_dest = (event_id << 4) | (destination_id & 0x0F);

    // Pack transport_type (high nibble) and transport_status (low nibble).
    let type_status = ((transport_type as u8) << 4) | (status as u8);

    let mut notif = TransportNotification {
        version: PROTOCOL_VERSION,
        source_id,
        notification_id,
        event_dest,
        type_status,
        duration_secs: 30,
        hmac_tag_infra: [0u8; HMAC_TAG_INFRA_LEN],
        hmac_tag_client: [0u8; HMAC_TAG_CLIENT_LEN],
    };

    // Sign with infrastructure key.
    notif.hmac_tag_infra = TransportNotification::compute_tag(HMAC_KEY_INFRA, notif.base_payload());
    notif
}

#[tokio::main]
async fn main() -> bluer::Result<()> {
    env_logger::init();

    let session = bluer::Session::new().await?;
    let adapter = session.default_adapter().await?;
    adapter.set_powered(true).await?;

    println!(
        "Advertising on Bluetooth adapter {} [{}]",
        adapter.name(),
        adapter.address().await?
    );

    // Generate a batch of random signed notifications.
    let notifications: Vec<TransportNotification> =
        (0..NOTIFICATION_COUNT).map(|_| random_notification()).collect();

    for (i, notif) in notifications.iter().enumerate() {
        let payload = notif.as_bytes();
        let nid = { notif.notification_id };
        let sid = { notif.source_id };
        println!(
            "\n── Notification {} ──\n  \
            id={:02x}{:02x}{:02x}{:02x} source={:02x}{:02x}{:02x}{:02x} event={} dest={} type={:?} status={:?} dur={}s\n  \
            infra-HMAC-valid={} client-tag-set={} payload({} B)={:02x?}",
            i,
            nid[0], nid[1], nid[2], nid[3],
            sid[0], sid[1], sid[2], sid[3],
            notif.event_id(),
            notif.destination_id(),
            notif.transport_type(),
            notif.transport_status(),
            { notif.duration_secs },
            notif.verify_infra(),
            notif.has_client_tag(),
            payload.len(),
            payload,
        );

        // Verify round-trip parsing.
        if let Some(parsed) = TransportNotification::from_payload(payload) {
            let pid = { parsed.notification_id };
            println!("    ✓ round-trip parse OK (id={:02x}{:02x}{:02x}{:02x})", pid[0], pid[1], pid[2], pid[3]);
        }
    }

    // Broadcast each notification one by one, 5 seconds apart.
    for (i, notif) in notifications.iter().enumerate() {
        let mut manufacturer_data = BTreeMap::new();
        manufacturer_data.insert(MANUFACTURER_ID, notif.as_bytes().to_vec());

        // Type::Broadcast produces ADV_NONCONN_IND — the advertisement is
        // non-connectable by definition.  Scanners will still see it in
        // their discovery results.
        let adv = Advertisement {
            advertisement_type: bluer::adv::Type::Broadcast,
            manufacturer_data,
            min_interval: Some(Duration::from_millis(20)),
            max_interval: Some(Duration::from_millis(20)),
            local_name: Some("TransportNotifier".to_string()),
            ..Default::default()
        };

        let nid = { notif.notification_id };
        println!(
            "\n[{}/{}] Broadcasting notification {:02x}{:02x}{:02x}{:02x} for 5s...",
            i + 1,
            notifications.len(),
            nid[0], nid[1], nid[2], nid[3],
        );

        let handle = adapter.advertise(adv).await?;
        tokio::time::sleep(Duration::from_secs(5)).await;
        drop(handle);

        println!("  ✓ done");
    }

    println!("\nAll notifications broadcast. Exiting.");
    Ok(())
}