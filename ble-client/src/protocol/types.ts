// ── Protocol definitions matching ble-broadcaster/ble-repeater ──────────

/** Custom manufacturer ID used by our protocol. */
export const MANUFACTURER_ID = 0xffff;

/** Current protocol version. */
export const PROTOCOL_VERSION = 1;

/**
 * Client-facing HMAC key (shared with repeater).
 * In production this would be securely distributed to the app.
 */
export const HMAC_KEY_CLIENT = 'client-secret-key-app!!!';

/** Number of bytes of the truncated infrastructure HMAC tag. */
export const HMAC_TAG_INFRA_LEN = 8;

/** Number of bytes of the truncated client HMAC tag. */
export const HMAC_TAG_CLIENT_LEN = 4;

/** Total notification struct size in bytes.
 *  1 + 4 + 4 + 1 + 1 + 2 + 8 + 4 = 25 (packed, no padding). */
export const NOTIFICATION_SIZE = 25;

/** Base payload size (everything before both HMAC tags). */
export const BASE_PAYLOAD_SIZE =
  NOTIFICATION_SIZE - HMAC_TAG_INFRA_LEN - HMAC_TAG_CLIENT_LEN;

// ── Enums ───────────────────────────────────────────────────────────────

export enum TransportType {
  Bus = 1,
  Train = 2,
}

export enum TransportStatus {
  Passing = 1,
  Coming = 2,
  Late = 3,
}

export const transportTypeLabel: Record<TransportType, string> = {
  [TransportType.Bus]: 'Bus',
  [TransportType.Train]: 'Train',
};

export const transportStatusLabel: Record<TransportStatus, string> = {
  [TransportStatus.Passing]: 'Passing',
  [TransportStatus.Coming]: 'Coming',
  [TransportStatus.Late]: 'Late',
};

export const transportTypeEmoji: Record<TransportType, string> = {
  [TransportType.Bus]: '🚌',
  [TransportType.Train]: '🚆',
};

export const transportStatusColor: Record<TransportStatus, string> = {
  [TransportStatus.Passing]: '#22c55e',
  [TransportStatus.Coming]: '#3b82f6',
  [TransportStatus.Late]: '#ef4444',
};

// ── Parsed notification interface ───────────────────────────────────────

export interface TransportNotification {
  version: number;
  sourceId: Uint8Array; // 4 bytes
  notificationId: Uint8Array; // 4 bytes
  eventId: number; // 0–15
  destinationId: number; // 0–15
  transportType: TransportType;
  transportStatus: TransportStatus;
  durationSecs: number;
  hmacTagInfra: Uint8Array; // 8 bytes
  hmacTagClient: Uint8Array; // 4 bytes
  /** Whether the client HMAC tag was successfully verified. */
  clientVerified: boolean;
  /** Raw payload bytes. */
  raw: Uint8Array;
  /** ISO timestamp when received. */
  receivedAt: string;
  /** RSSI of the advertisement (if available). */
  rssi?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format a byte array as a hex string (e.g. "a1b2c3d4"). */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Format a notification ID for display. */
export function formatNotificationId(id: Uint8Array): string {
  return bytesToHex(id).toUpperCase();
}
