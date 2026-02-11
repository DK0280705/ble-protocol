import { ref, shallowRef, computed, readonly } from 'vue';
import {
  MANUFACTURER_ID,
  PROTOCOL_VERSION,
  TransportType,
  TransportStatus,
} from '@/protocol/types';
import type { TransportNotification } from '@/protocol/types';
import { formatNotificationId, bytesToHex } from '@/protocol/types';
import { parseNotification } from '@/protocol/parser';

// ── Types ─────────────────────────────────────────────────────────────

export type BleStatus = 'idle' | 'scanning' | 'error' | 'unsupported';

/**
 * Two scanning modes based on the Web Bluetooth specs:
 *
 * - `scan`  — Uses `requestLEScan()` from the Web Bluetooth Scanning spec.
 * - `watch` — Uses `requestDevice()` + `watchAdvertisements()` from the
 *             main Web Bluetooth spec.
 */
export type ScanMode = 'scan' | 'watch';

// ── Composable ────────────────────────────────────────────────────────

export function useBluetooth() {
  const status = ref<BleStatus>('idle');
  const errorMessage = ref<string | null>(null);
  const notifications = ref<TransportNotification[]>([]);
  const activeMode = ref<ScanMode | null>(null);

  // --- requestLEScan state ---
  const scanInstance = shallowRef<BluetoothLEScan | null>(null);
  const scanHandler = shallowRef<((ev: BluetoothAdvertisingEvent) => void) | null>(null);

  // --- requestDevice + watchAdvertisements state ---
  const watchedDevice = shallowRef<BluetoothDevice | null>(null);
  const watchAbort = shallowRef<AbortController | null>(null);
  const deviceHandler = shallowRef<((ev: Event) => void) | null>(null);

  const MAX_NOTIFICATIONS = 100;

  // ── Permission state ───────────────────────────────────────────────

  const permissionGranted = ref(false);

  // ── Support checks ────────────────────────────────────────────────

  const bt: Bluetooth | null =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator
      ? navigator.bluetooth
      : null;

  const supportsScan = computed(
    () => !!bt && typeof (bt as any).requestLEScan === 'function',
  );
  const supportsWatch = computed(
    () =>
      !!bt &&
      typeof bt.requestDevice === 'function' &&
      typeof window !== 'undefined' &&
      'BluetoothDevice' in window &&
      typeof (window as any).BluetoothDevice?.prototype?.watchAdvertisements === 'function',
  );
  const isSupported = computed(() => supportsScan.value || supportsWatch.value);

  // ── Derived state ─────────────────────────────────────────────────

  const isScanning = computed(() => status.value === 'scanning');
  const verifiedCount = computed(
    () => notifications.value.filter((n) => n.clientVerified).length,
  );
  const unverifiedCount = computed(
    () => notifications.value.filter((n) => !n.clientVerified).length,
  );

  // ══════════════════════════════════════════════════════════════════
  //  MODE 1 — requestLEScan  (Scanning spec)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Request Bluetooth permissions by calling requestDevice().
   * On Android Chrome, requestLEScan() will fail with "Bluetooth adapter
   * not available" unless the user has first granted Bluetooth permission
   * via the device picker prompt.
   */
  /**
   * Request Bluetooth permission via requestDevice().
   * On Android Chrome, requestLEScan() fails unless the user has
   * first granted Bluetooth permission through the device picker.
   * Call this once before scanning.
   */
  async function requestPermission() {
    try {
      errorMessage.value = null;

      if (navigator.bluetooth.getAvailability) {
        const available = await navigator.bluetooth.getAvailability();
        if (!available) {
          errorMessage.value = 'No Bluetooth adapter found. Please enable Bluetooth.';
          status.value = 'error';
          return;
        }
      }

      await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalManufacturerData: [MANUFACTURER_ID],
      });
      permissionGranted.value = true;
    } catch (err: any) {
      // User cancelled the device picker — permission is still granted
      if (err.name === 'NotFoundError') {
        permissionGranted.value = true;
        return;
      }
      errorMessage.value = `Bluetooth permission error: ${err.message || err}`;
      status.value = 'error';
    }
  }

  async function startScan() {
    if (!supportsScan.value) {
      status.value = 'unsupported';
      errorMessage.value =
        'requestLEScan() not available. ' +
        'Enable chrome://flags/#enable-experimental-web-platform-features';
      return;
    }

    try {
      errorMessage.value = null;

      // requestLEScan MUST be the first async call in the user-gesture
      // handler, otherwise the browser rejects it as "blocked by user".
      const scan = await navigator.bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });

      status.value = 'scanning';
      activeMode.value = 'scan';
      scanInstance.value = scan;

      const handler = (ev: BluetoothAdvertisingEvent) => handleAdvertisement(ev);
      scanHandler.value = handler;
      navigator.bluetooth.addEventListener('advertisementreceived', handler);
    } catch (err: any) {
      status.value = 'error';
      errorMessage.value = err.message || String(err);
    }
  }

  function stopScan() {
    if (scanInstance.value) {
      scanInstance.value.stop();
      scanInstance.value = null;
    }
    if (scanHandler.value) {
      navigator.bluetooth.removeEventListener(
        'advertisementreceived',
        scanHandler.value as EventListener,
      );
      scanHandler.value = null;
    }
    if (activeMode.value === 'scan') {
      status.value = 'idle';
      activeMode.value = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  MODE 2 — requestDevice + watchAdvertisements  (Main spec)
  // ══════════════════════════════════════════════════════════════════

  async function startWatch() {
    if (!supportsWatch.value) {
      status.value = 'unsupported';
      errorMessage.value =
        'requestDevice() + watchAdvertisements() not available in this browser.';
      return;
    }

    try {
      status.value = 'scanning';
      activeMode.value = 'watch';
      errorMessage.value = null;

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            manufacturerData: [{ companyIdentifier: MANUFACTURER_ID }],
          },
        ],
        optionalManufacturerData: [MANUFACTURER_ID],
      });

      watchedDevice.value = device;

      const abort = new AbortController();
      watchAbort.value = abort;

      await device.watchAdvertisements({ signal: abort.signal });

      const handler = (ev: Event) =>
        handleAdvertisement(ev as BluetoothAdvertisingEvent);
      deviceHandler.value = handler;
      device.addEventListener('advertisementreceived', handler);
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        status.value = 'idle';
        activeMode.value = null;
        return;
      }
      status.value = 'error';
      errorMessage.value = err.message || String(err);
    }
  }

  function stopWatch() {
    if (watchAbort.value) {
      watchAbort.value.abort();
      watchAbort.value = null;
    }
    if (watchedDevice.value && deviceHandler.value) {
      watchedDevice.value.removeEventListener('advertisementreceived', deviceHandler.value);
      deviceHandler.value = null;
    }
    watchedDevice.value = null;
    if (activeMode.value === 'watch') {
      status.value = 'idle';
      activeMode.value = null;
    }
  }

  // ── Universal stop ────────────────────────────────────────────────

  function stopAll() {
    stopScan();
    stopWatch();
    status.value = 'idle';
    activeMode.value = null;
  }

  function clearNotifications() {
    notifications.value = [];
  }

  // ── Shared advertisement handler ──────────────────────────────────

  async function handleAdvertisement(event: BluetoothAdvertisingEvent) {
    const rssi: number | null = event.rssi ?? null;
    const manufacturerData = event.manufacturerData;

    if (!manufacturerData || manufacturerData.size === 0) return;

    // Only process our manufacturer ID — ignore everything else
    if (!manufacturerData.has(MANUFACTURER_ID)) return;

    const data = manufacturerData.get(MANUFACTURER_ID);
    if (!data) return;

    const payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const notif = await parseNotification(payload, rssi ?? undefined);

    if (!notif) return;

    const notifId = formatNotificationId(notif.notificationId);

    const existingIdx = notifications.value.findIndex(
      (n) => formatNotificationId(n.notificationId) === notifId,
    );

    if (existingIdx >= 0) {
      // If already verified, don't update — keep it stable in the list
      if (notifications.value[existingIdx]?.clientVerified) return;
      // Only update if the new one is verified (upgrade unverified → verified)
      if (notif.clientVerified) {
        notifications.value[existingIdx] = notif;
      }
    } else {
      notifications.value.unshift(notif);
      if (notifications.value.length > MAX_NOTIFICATIONS) {
        notifications.value = notifications.value.slice(0, MAX_NOTIFICATIONS);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    status: readonly(status),
    errorMessage: readonly(errorMessage),
    notifications: readonly(notifications),
    activeMode: readonly(activeMode),
    isSupported: readonly(isSupported),
    permissionGranted: readonly(permissionGranted),

    isScanning,
    supportsScan,
    supportsWatch,
    verifiedCount,
    unverifiedCount,

    requestPermission,
    startScan,
    stopScan,
    startWatch,
    stopWatch,
    stopAll,
    clearNotifications,
  };
}
