<script setup lang="ts">
import { useBluetooth } from '@/composables/useBluetooth';
import BrowserSupport from '@/components/BrowserSupport.vue';
import ScanControls from '@/components/ScanControls.vue';
import NotificationList from '@/components/NotificationList.vue';

const {
  status,
  errorMessage,
  notifications,
  activeMode,
  isSupported,
  isScanning,
  supportsScan,
  permissionGranted,
  verifiedCount,
  unverifiedCount,
  requestPermission,
  startScan,
  stopScan,
  stopAll,
  clearNotifications,
} = useBluetooth();
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>🚏 Transport BLE</h1>
    </header>

    <main>
      <BrowserSupport :is-supported="isSupported" />

      <ScanControls
        :status="status"
        :active-mode="activeMode"
        :is-scanning="isScanning"
        :is-supported="isSupported"
        :supports-scan="supportsScan"
        :permission-granted="permissionGranted"
        :error-message="errorMessage"
        :total-count="notifications.length"
        :verified-count="verifiedCount"
        :unverified-count="unverifiedCount"
        @request-permission="requestPermission"
        @start-scan="startScan"
        @stop-scan="stopScan"
        @stop-all="stopAll"
        @clear="clearNotifications"
      />

      <NotificationList
        :notifications="notifications"
        :is-scanning="isScanning"
      />
    </main>
  </div>
</template>

<style>
:root {
  --color-bg: #f0f2f5;
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
  -webkit-tap-highlight-color: transparent;
}

html {
  font-size: 16px;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
</style>

<style scoped>
.app {
  width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.app-header {
  text-align: center;
  margin-bottom: 1rem;
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

main {
  flex: 1;
}
</style>
