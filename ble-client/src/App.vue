<script setup lang="ts">
import { useBluetooth } from '@/composables/useBluetooth';
import BrowserSupport from '@/components/BrowserSupport.vue';
import ScanControls from '@/components/ScanControls.vue';
import NotificationList from '@/components/NotificationList.vue';
import ScanLog from '@/components/ScanLog.vue';

const {
  status,
  errorMessage,
  notifications,
  scanLog,
  activeMode,
  isSupported,
  diagnostics,
  isScanning,
  supportsScan,
  supportsWatch,
  verifiedCount,
  unverifiedCount,
  startScan,
  stopScan,
  startWatch,
  stopWatch,
  stopAll,
  clearNotifications,
  injectTestNotification,
} = useBluetooth();
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>🚏 Transport BLE Client</h1>
      <p class="subtitle">Real-time transport notifications via Bluetooth Low Energy</p>
    </header>

    <main>
      <BrowserSupport :is-supported="isSupported" />

      <!-- Diagnostics panel -->
      <div class="diagnostics">
        <h3>🔍 BLE Diagnostics</h3>
        <table>
          <tr>
            <td>Secure context (HTTPS/localhost)</td>
            <td :class="diagnostics.isSecureContext ? 'ok' : 'bad'">
              {{ diagnostics.isSecureContext ? '✓ Yes' : '✗ No — BLE requires HTTPS or localhost' }}
            </td>
          </tr>
          <tr>
            <td>navigator.bluetooth</td>
            <td :class="diagnostics.hasBluetooth ? 'ok' : 'bad'">
              {{ diagnostics.hasBluetooth ? '✓ Present' : '✗ Missing' }}
            </td>
          </tr>
          <tr>
            <td>Bluetooth available</td>
            <td :class="diagnostics.bluetoothAvailable === true ? 'ok' : diagnostics.bluetoothAvailable === false ? 'bad' : ''">
              {{ diagnostics.bluetoothAvailable === true ? '✓ Adapter present' : diagnostics.bluetoothAvailable === false ? '✗ No adapter' : '? Unknown (getAvailability not called)' }}
            </td>
          </tr>
          <tr>
            <td>bluetooth.requestDevice()</td>
            <td :class="diagnostics.hasRequestDevice ? 'ok' : 'bad'">
              {{ diagnostics.hasRequestDevice ? '✓ Available' : '✗ Missing' }}
            </td>
          </tr>
          <tr>
            <td>device.watchAdvertisements()</td>
            <td :class="diagnostics.hasWatchAdvertisements ? 'ok' : 'bad'">
              {{ diagnostics.hasWatchAdvertisements ? '✓ Available' : '✗ Missing' }}
            </td>
          </tr>
          <tr>
            <td>bluetooth.requestLEScan()</td>
            <td :class="diagnostics.hasRequestLEScan ? 'ok' : 'bad'">
              {{ diagnostics.hasRequestLEScan ? '✓ Available (experimental)' : '✗ Not available — enable chrome://flags/#enable-experimental-web-platform-features' }}
            </td>
          </tr>
          <tr>
            <td>Protocol</td>
            <td>{{ diagnostics.protocol }}</td>
          </tr>
        </table>
        <div class="diagnostics-actions">
          <button class="btn btn-test" @click="injectTestNotification">
            🧪 Inject Test Notification
          </button>
        </div>
      </div>

      <ScanControls
        :status="status"
        :active-mode="activeMode"
        :is-scanning="isScanning"
        :is-supported="isSupported"
        :supports-scan="supportsScan"
        :supports-watch="supportsWatch"
        :error-message="errorMessage"
        :total-count="notifications.length"
        :verified-count="verifiedCount"
        :unverified-count="unverifiedCount"
        @start-scan="startScan"
        @stop-scan="stopScan"
        @start-watch="startWatch"
        @stop-watch="stopWatch"
        @stop-all="stopAll"
        @clear="clearNotifications"
      />

      <NotificationList
        :notifications="notifications"
        :is-scanning="isScanning"
      />

      <ScanLog
        :log="scanLog"
        :is-scanning="isScanning"
      />
    </main>

    <footer class="app-footer">
      <p>
        BLE Protocol v1 · Manufacturer ID <code>0xFFFF</code> ·
        Client HMAC-SHA256 verification
      </p>
    </footer>
  </div>
</template>

<style>
:root {
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #94a3b8;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f172a;
    --color-surface: #1e293b;
    --color-border: #334155;
    --color-text: #f1f5f9;
    --color-text-muted: #64748b;
  }

  .error-banner {
    background: #451a1a !important;
    border-color: #7f1d1d !important;
    color: #fca5a5 !important;
  }

  .support-warning {
    background: #451a03 !important;
    border-color: #78350f !important;
    color: #fde68a !important;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app-container {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.app-header h1 {
  margin: 0;
  font-size: 1.8rem;
}

.subtitle {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

main {
  flex: 1;
}

.app-footer {
  text-align: center;
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.app-footer p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.app-footer code {
  background: var(--color-border);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.diagnostics {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.diagnostics h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.diagnostics table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.diagnostics td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.diagnostics td:first-child {
  font-weight: 600;
  white-space: nowrap;
  width: 40%;
}

.diagnostics td.ok {
  color: #22c55e;
}

.diagnostics td.bad {
  color: #ef4444;
}

.btn-test {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  background: #8b5cf6;
  color: white;
}

.btn-test:hover {
  background: #7c3aed;
}
</style>
