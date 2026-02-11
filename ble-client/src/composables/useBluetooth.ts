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
 *             Passively receives ALL nearby advertisements without user
 *             device selection.  Requires Chrome flag:
 *             chrome://flags/#enable-experimental-web-platform-features
 *
 * - `watch` — Uses `requestDevice()` + `watchAdvertisements()` from the
 *             main Web Bluetooth spec.  The user selects a device in a
 *             browser dialog; only that device's advertisements are reported.
 *             Supported without extra flags in Chrome 79+.
 *
 * @see https://webbluetoothcg.github.io/web-bluetooth/
 * @see https://webbluetoothcg.github.io/web-bluetooth/scanning.html
 */
export type ScanMode = 'scan' | 'watch';

export interface ScanLogEntry {
  timestamp: string;
  deviceName: string | null;
  rssi: number | null;
  manufacturerIds: readonly number[];
  isOurs: boolean;
  parsed: boolean;
  raw: string;
}

export interface BleDiagnostics {
  hasBluetooth: boolean;
  hasRequestLEScan: boolean;
  hasRequestDevice: boolean;
  hasWatchAdvertisements: boolean;
  hasGetAvailability: boolean;
  isSecureContext: boolean;
  bluetoothAvailable: boolean | null; // null = unknown yet
  protocol: string;
  userAgent: string;
}

// ── Composable ────────────────────────────────────────────────────────

/**
 * Vue composable for scanning BLE advertisements and parsing
 * TransportNotification payloads.
 *
 * Implements both Web Bluetooth specs:
 *   • Main spec:     requestDevice → watchAdvertisements → advertisementreceived on device
 *   • Scanning spec: requestLEScan → advertisementreceived on navigator.bluetooth
 *
 * @see https://webbluetoothcg.github.io/web-bluetooth/
 * @see https://webbluetoothcg.github.io/web-bluetooth/scanning.html
 */
export function useBluetooth() {
  const status = ref<BleStatus>('idle');
  const errorMessage = ref<string | null>(null);
  const notifications = ref<TransportNotification[]>([]);
  const scanLog = ref<ScanLogEntry[]>([]);
  const activeMode = ref<ScanMode | null>(null);

  // --- requestLEScan state (Scanning spec) ---
  const scanInstance = shallowRef<BluetoothLEScan | null>(null);
  const scanHandler = shallowRef<((ev: BluetoothAdvertisingEvent) => void) | null>(null);

  // --- requestDevice + watchAdvertisements state (Main spec) ---
  const watchedDevice = shallowRef<BluetoothDevice | null>(null);
  const watchAbort = shallowRef<AbortController | null>(null);
  const deviceHandler = shallowRef<((ev: Event) => void) | null>(null);

  const MAX_NOTIFICATIONS = 100;
  const MAX_LOG_ENTRIES = 200;

  // ── Diagnostics ───────────────────────────────────────────────────

  const diagnostics = ref<BleDiagnostics>(getDiagnostics());

  function getDiagnostics(): BleDiagnostics {
    const bt: Bluetooth | null =
      typeof navigator !== 'undefined' && 'bluetooth' in navigator
        ? navigator.bluetooth
        : null;

    return {
      hasBluetooth: !!bt,
      hasRequestLEScan: !!bt && typeof (bt as any).requestLEScan === 'function',
      hasRequestDevice: !!bt && typeof bt.requestDevice === 'function',
      hasWatchAdvertisements:
        typeof window !== 'undefined' &&
        'BluetoothDevice' in window &&
        typeof (window as any).BluetoothDevice?.prototype?.watchAdvertisements === 'function',
      hasGetAvailability: !!bt && typeof bt.getAvailability === 'function',
      isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
      bluetoothAvailable: null,
      protocol: typeof location !== 'undefined' ? location.protocol : '?',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '?',
    };
  }

  /**
   * Probe Bluetooth adapter availability (Main spec §4.2).
   * @see https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-getavailability
   */
  async function probeAvailability() {
    try {
      if (navigator.bluetooth?.getAvailability) {
        const available = await navigator.bluetooth.getAvailability();
        diagnostics.value = { ...diagnostics.value, bluetoothAvailable: available };

        // Listen for adapter plug/unplug (Main spec §4.2 availabilitychanged)
        navigator.bluetooth.addEventListener('availabilitychanged', ((e: Event) => {
          diagnostics.value = {
            ...diagnostics.value,
            bluetoothAvailable: (e as any).value as boolean,
          };
        }) as EventListener);
      }
    } catch {
      // getAvailability not supported or threw — leave as null
    }
  }
  probeAvailability();

  // ── Support checks ────────────────────────────────────────────────

  const supportsScan = computed(() => diagnostics.value.hasRequestLEScan);
  const supportsWatch = computed(
    () => diagnostics.value.hasRequestDevice && diagnostics.value.hasWatchAdvertisements,
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
  //
  //  Passively scans for ALL advertisements.  No device picker.
  //  Per Scanning spec §5.1, matching events fire at the
  //  BluetoothDevice inside the Bluetooth instance.  The spec
  //  example in §1.1 shows listening on navigator.bluetooth.
  //
  //  @see https://webbluetoothcg.github.io/web-bluetooth/scanning.html
  // ══════════════════════════════════════════════════════════════════

  async function startScan() {
    if (!supportsScan.value) {
      status.value = 'unsupported';
      errorMessage.value =
        'requestLEScan() not available. ' +
        'Enable chrome://flags/#enable-experimental-web-platform-features';
      return;
    }

    try {
      status.value = 'scanning';
      activeMode.value = 'scan';
      errorMessage.value = null;

      addLogMessage('Requesting BLE scan (requestLEScan, acceptAllAdvertisements)…');

      // Scanning spec §4: requestLEScan with acceptAllAdvertisements
      const scan = await navigator.bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });
      console.log(scan.active);
      scanInstance.value = scan;

      addLogMessage(
        `Scan started: active=${scan.active}, acceptAll=${scan.acceptAllAdvertisements}`,
      );

      // Scanning spec §1.1 example: listen on navigator.bluetooth
      const handler = (ev: BluetoothAdvertisingEvent) => handleAdvertisement(ev);
      scanHandler.value = handler;
      navigator.bluetooth.addEventListener('advertisementreceived', handler);

      addLogMessage('Listening for advertisementreceived events…');
      console.log('[BLE] requestLEScan started, scan object:', scan);
    } catch (err: any) {
      status.value = 'error';
      const msg = err.message || String(err);
      errorMessage.value = msg;
      addLogMessage(`ERROR starting scan: ${msg}`);
      console.error('[BLE] requestLEScan error:', err);
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
    console.log('[BLE] requestLEScan stopped');
  }

  // ══════════════════════════════════════════════════════════════════
  //  MODE 2 — requestDevice + watchAdvertisements  (Main spec)
  //
  //  The user picks a BLE device via the browser's device chooser.
  //  We then call device.watchAdvertisements() and listen for
  //  `advertisementreceived` events on that BluetoothDevice.
  //
  //  Main spec §5.2:   watchAdvertisements(options)
  //  Main spec §5.2.3: BluetoothAdvertisingEvent at BluetoothDevice
  //  Main spec §6.6.6: onadvertisementreceived event handler IDL attr
  //
  //  @see https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothdevice-watchadvertisements
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

      addLogMessage('Opening device picker (requestDevice with manufacturer filter 0xFFFF)…');

      // Main spec §4: Request a device filtered by our manufacturer data.
      // optionalManufacturerData allows reading mfg data in adverts (§5.2.3).
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          {
            manufacturerData: [{ companyIdentifier: MANUFACTURER_ID }],
          },
        ],
        optionalManufacturerData: [MANUFACTURER_ID],
      });

      watchedDevice.value = device;
      addLogMessage(`Device selected: "${device.name ?? device.id}"`);

      // Main spec §5.2: watchAdvertisements with AbortSignal
      const abort = new AbortController();
      watchAbort.value = abort;

      await device.watchAdvertisements({ signal: abort.signal });

      addLogMessage(
        `watchAdvertisements started, watchingAdvertisements=${device.watchingAdvertisements}`,
      );

      // Main spec §5.2.3 & §6.6.6: advertisementreceived fires on BluetoothDevice
      const handler = (ev: Event) =>
        handleAdvertisement(ev as BluetoothAdvertisingEvent);
      deviceHandler.value = handler;
      device.addEventListener('advertisementreceived', handler);

      console.log('[BLE] watchAdvertisements started for device:', device);
    } catch (err: any) {
      // User cancellation gives "NotFoundError" — don't treat as error
      if (err.name === 'NotFoundError') {
        status.value = 'idle';
        activeMode.value = null;
        addLogMessage('Device picker cancelled by user.');
        return;
      }
      status.value = 'error';
      const msg = err.message || String(err);
      errorMessage.value = msg;
      addLogMessage(`ERROR starting watch: ${msg}`);
      console.error('[BLE] watchAdvertisements error:', err);
    }
  }

  function stopWatch() {
    // Main spec §5.2: abort via AbortController signal
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
    console.log('[BLE] watchAdvertisements stopped');
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
    scanLog.value = [];
  }

  // ── Shared advertisement handler ──────────────────────────────────

  /**
   * Handle a BluetoothAdvertisingEvent from either scan mode.
   *
   * Per main spec §5.2.3, the event carries:
   *   - device: BluetoothDevice
   *   - uuids:  FrozenArray<UUID>
   *   - name:   DOMString?
   *   - appearance: unsigned short?
   *   - txPower: byte?
   *   - rssi:   byte?
   *   - manufacturerData: BluetoothManufacturerDataMap  (maplike<unsigned short, DataView>)
   *   - serviceData:      BluetoothServiceDataMap       (maplike<UUID, DataView>)
   */
  async function handleAdvertisement(event: BluetoothAdvertisingEvent) {
    const deviceName: string | null = event.device?.name ?? event.name ?? null;
    const rssi: number | null = event.rssi ?? null;
    const manufacturerData = event.manufacturerData;

    // Collect all manufacturer IDs present in this advertisement
    const manufacturerIds: number[] = [];
    const rawParts: string[] = [];

    if (manufacturerData && manufacturerData.size > 0) {
      manufacturerData.forEach((view: DataView, id: number) => {
        manufacturerIds.push(id);
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        rawParts.push(`0x${id.toString(16).padStart(4, '0')}=[${bytesToHex(bytes)}]`);
      });
    }

    const isOurs = manufacturerIds.includes(MANUFACTURER_ID);
    let parsed = false;

    // Try to parse our protocol notification
    if (isOurs && manufacturerData) {
      const data = manufacturerData.get(MANUFACTURER_ID);
      if (data) {
        const payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const notif = await parseNotification(payload, rssi ?? undefined);

        if (notif) {
          parsed = true;
          const id = formatNotificationId(notif.notificationId);
          console.log(`[BLE] ✓ Parsed notification ${id} (verified=${notif.clientVerified})`);

          const existingIdx = notifications.value.findIndex(
            (n) =>
              formatNotificationId(n.notificationId) ===
              formatNotificationId(notif.notificationId),
          );

          if (existingIdx >= 0) {
            notifications.value[existingIdx] = notif;
          } else {
            notifications.value.unshift(notif);
            if (notifications.value.length > MAX_NOTIFICATIONS) {
              notifications.value = notifications.value.slice(0, MAX_NOTIFICATIONS);
            }
          }
        }
      }
    }

    // Always log every advertisement to the scan log
    const logEntry: ScanLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      deviceName,
      rssi,
      manufacturerIds,
      isOurs,
      parsed,
      raw: rawParts.length > 0 ? rawParts.join(' ') : '(no mfg data)',
    };

    scanLog.value.unshift(logEntry);
    if (scanLog.value.length > MAX_LOG_ENTRIES) {
      scanLog.value = scanLog.value.slice(0, MAX_LOG_ENTRIES);
    }

    console.log(
      `[BLE] adv: device=${deviceName ?? '?'} rssi=${rssi} mfg=[${manufacturerIds.map((id) => '0x' + id.toString(16)).join(',')}] ours=${isOurs} parsed=${parsed}`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Add a system/diagnostic message to the scan log. */
  function addLogMessage(message: string) {
    scanLog.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      deviceName: null,
      rssi: null,
      manufacturerIds: [],
      isOurs: false,
      parsed: false,
      raw: `⚙ ${message}`,
    });
    console.log(`[BLE] ${message}`);
  }

  /**
   * Inject a fake TransportNotification to verify the UI pipeline
   * works end-to-end without needing a real BLE device.
   */
  async function injectTestNotification() {
    // Build a raw 25-byte payload matching the packed protocol struct
    const buf = new ArrayBuffer(25);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);

    // version
    view.setUint8(0, PROTOCOL_VERSION);
    // source_id (4 bytes)
    arr.set([0xaa, 0xbb, 0xcc, 0xdd], 1);
    // notification_id (4 bytes) — random
    const randId = new Uint8Array(4);
    crypto.getRandomValues(randId);
    arr.set(randId, 5);
    // event_dest: event_id=3 (high nibble), dest_id=7 (low nibble)
    view.setUint8(9, (3 << 4) | 7);
    // type_status: Bus=1 (high nibble), Coming=2 (low nibble)
    view.setUint8(10, (TransportType.Bus << 4) | TransportStatus.Coming);
    // duration_secs: 30, little-endian
    view.setUint16(11, 30, true);
    // hmac_tag_infra (8 bytes) — dummy
    arr.set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08], 13);
    // hmac_tag_client (4 bytes) — zeroes (no repeater)
    arr.set([0x00, 0x00, 0x00, 0x00], 21);

    const notif = await parseNotification(arr, -42);

    if (notif) {
      const id = formatNotificationId(notif.notificationId);
      notifications.value.unshift(notif);
      addLogMessage(`TEST injected notification ${id} (verified=${notif.clientVerified})`);
    } else {
      const testNotif: TransportNotification = {
        version: PROTOCOL_VERSION,
        sourceId: arr.slice(1, 5),
        notificationId: arr.slice(5, 9),
        eventId: 3,
        destinationId: 7,
        transportType: TransportType.Bus,
        transportStatus: TransportStatus.Coming,
        durationSecs: 30,
        hmacTagInfra: arr.slice(13, 21),
        hmacTagClient: arr.slice(21, 25),
        clientVerified: false,
        raw: arr.slice(0, 25),
        receivedAt: new Date().toISOString(),
        rssi: -42,
      };
      notifications.value.unshift(testNotif);
      addLogMessage('TEST injected notification (manual, unverified)');
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    // State
    status: readonly(status),
    errorMessage: readonly(errorMessage),
    notifications: readonly(notifications),
    scanLog: readonly(scanLog),
    activeMode: readonly(activeMode),
    isSupported: readonly(isSupported),
    diagnostics: readonly(diagnostics),

    // Computed
    isScanning,
    supportsScan,
    supportsWatch,
    verifiedCount,
    unverifiedCount,

    // Actions
    startScan,
    stopScan,
    startWatch,
    stopWatch,
    stopAll,
    clearNotifications,
    injectTestNotification,
  };
}
