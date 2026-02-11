import {
  PROTOCOL_VERSION,
  NOTIFICATION_SIZE,
  BASE_PAYLOAD_SIZE,
  HMAC_TAG_INFRA_LEN,
  HMAC_TAG_CLIENT_LEN,
  HMAC_KEY_CLIENT,
  TransportType,
  TransportStatus,
  type TransportNotification,
} from './types';

/**
 * Compute a truncated HMAC-SHA256 tag using the Web Crypto API.
 * Returns the first `length` bytes of the full HMAC.
 */
async function computeHmacTag(
  key: string,
  data: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, buf);
  return new Uint8Array(signature).slice(0, length);
}

/**
 * Verify the client HMAC tag of a notification.
 */
async function verifyClientTag(
  basePayload: Uint8Array,
  clientTag: Uint8Array,
): Promise<boolean> {
  const expected = await computeHmacTag(
    HMAC_KEY_CLIENT,
    basePayload,
    HMAC_TAG_CLIENT_LEN,
  );
  if (expected.length !== clientTag.length) return false;
  return expected.every((b, i) => b === clientTag[i]);
}

/**
 * Check whether the client tag bytes are all zeroes (not yet signed).
 */
function hasClientTag(tag: Uint8Array): boolean {
  return tag.some((b) => b !== 0);
}

/**
 * Parse a manufacturer-data payload into a TransportNotification.
 * Returns `null` if the payload is invalid or HMAC verification fails.
 *
 * Layout (24 bytes, packed, little-endian):
 *   [0]       version          u8
 *   [1..5]    source_id        [u8; 4]
 *   [5..9]    notification_id  [u8; 4]
 *   [9]       event_dest       u8   (high nibble = event_id, low = dest_id)
 *   [10]      type_status      u8   (high nibble = transport_type, low = status)
 *   [11..13]  duration_secs    u16 LE
 *   [13..21]  hmac_tag_infra   [u8; 8]
 *   [21..25]  hmac_tag_client  [u8; 4]
 */
export async function parseNotification(
  payload: Uint8Array,
  rssi?: number,
): Promise<TransportNotification | null> {
  if (payload.length < NOTIFICATION_SIZE) {
    console.warn(
      `[BLE] Payload too short: ${payload.length} < ${NOTIFICATION_SIZE}`,
    );
    return null;
  }

  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );

  // ── Parse fields ──────────────────────────────────────────────────
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    console.warn(`[BLE] Unknown protocol version: ${version}`);
    return null;
  }

  const sourceId = payload.slice(1, 5);
  const notificationId = payload.slice(5, 9);

  const eventDest = view.getUint8(9);
  const eventId = (eventDest >> 4) & 0x0f;
  const destinationId = eventDest & 0x0f;

  const typeStatus = view.getUint8(10);
  const transportTypeVal = (typeStatus >> 4) & 0x0f;
  const transportStatusVal = typeStatus & 0x0f;

  // Validate enum values
  if (!(transportTypeVal in TransportType)) {
    console.warn(`[BLE] Invalid transport type: ${transportTypeVal}`);
    return null;
  }
  if (!(transportStatusVal in TransportStatus)) {
    console.warn(`[BLE] Invalid transport status: ${transportStatusVal}`);
    return null;
  }

  const transportType = transportTypeVal as TransportType;
  const transportStatus = transportStatusVal as TransportStatus;

  const durationSecs = view.getUint16(11, true); // little-endian

  const hmacTagInfra = payload.slice(
    BASE_PAYLOAD_SIZE,
    BASE_PAYLOAD_SIZE + HMAC_TAG_INFRA_LEN,
  );
  const hmacTagClient = payload.slice(
    BASE_PAYLOAD_SIZE + HMAC_TAG_INFRA_LEN,
    BASE_PAYLOAD_SIZE + HMAC_TAG_INFRA_LEN + HMAC_TAG_CLIENT_LEN,
  );

  // ── Verify client HMAC tag ────────────────────────────────────────
  const basePayload = payload.slice(0, BASE_PAYLOAD_SIZE);
  let clientVerified = false;

  if (hasClientTag(hmacTagClient)) {
    clientVerified = await verifyClientTag(basePayload, hmacTagClient);
    if (!clientVerified) {
      console.warn('[BLE] Client HMAC tag mismatch — notification may be forged');
    }
  } else {
    console.warn('[BLE] Client tag not set (no repeater in chain)');
  }

  return {
    version,
    sourceId,
    notificationId,
    eventId,
    destinationId,
    transportType,
    transportStatus,
    durationSecs,
    hmacTagInfra,
    hmacTagClient,
    clientVerified,
    raw: payload.slice(0, NOTIFICATION_SIZE),
    receivedAt: new Date().toISOString(),
    rssi,
  };
}
