<script setup lang="ts">
import type { BleStatus, ScanMode } from '@/composables/useBluetooth';

defineProps<{
  status: BleStatus;
  activeMode: ScanMode | null;
  isScanning: boolean;
  isSupported: boolean;
  supportsScan: boolean;
  supportsWatch: boolean;
  errorMessage: string | null;
  totalCount: number;
  verifiedCount: number;
  unverifiedCount: number;
}>();

defineEmits<{
  startScan: [];
  stopScan: [];
  startWatch: [];
  stopWatch: [];
  stopAll: [];
  clear: [];
}>();

const statusLabel: Record<BleStatus, string> = {
  idle: 'Ready',
  scanning: 'Scanning…',
  error: 'Error',
  unsupported: 'Unsupported',
};

const statusIcon: Record<BleStatus, string> = {
  idle: '⏸',
  scanning: '📡',
  error: '❌',
  unsupported: '⚠️',
};
</script>

<template>
  <div class="scan-controls">
    <div class="controls-header">
      <h2>
        <span class="status-icon">{{ statusIcon[status] }}</span>
        {{ statusLabel[status] }}
        <span v-if="activeMode" class="mode-badge">
          {{ activeMode === 'scan' ? 'requestLEScan' : 'watchAdvertisements' }}
        </span>
      </h2>
    </div>

    <!-- Scan mode buttons -->
    <div class="button-group">
      <template v-if="!isScanning">
        <button
          class="btn btn-primary"
          :disabled="!supportsWatch"
          :title="supportsWatch ? 'Main spec: Pick a device and watch its advertisements' : 'requestDevice + watchAdvertisements not available'"
          @click="$emit('startWatch')"
        >
          📱 Pick Device
        </button>
        <button
          class="btn btn-scan"
          :disabled="!supportsScan"
          :title="supportsScan ? 'Scanning spec: Receive all nearby BLE advertisements (experimental)' : 'requestLEScan not available — enable experimental flag'"
          @click="$emit('startScan')"
        >
          📡 Scan All
        </button>
      </template>
      <template v-else>
        <button class="btn btn-danger" @click="$emit('stopAll')">
          ⏹ Stop
        </button>
      </template>
      <button
        class="btn btn-secondary"
        :disabled="totalCount === 0"
        @click="$emit('clear')"
      >
        🗑 Clear
      </button>
    </div>

    <p class="mode-hint">
      <strong>📱 Pick Device</strong> — Standard API: select a specific broadcaster, then watch its adverts.<br>
      <strong>📡 Scan All</strong> — Experimental: passively receive all nearby BLE adverts (needs Chrome flag).
    </p>

    <div v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
    </div>

    <div class="stats-bar">
      <div class="stat">
        <span class="stat-value">{{ totalCount }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat stat-verified">
        <span class="stat-value">{{ verifiedCount }}</span>
        <span class="stat-label">Verified ✓</span>
      </div>
      <div class="stat stat-unverified">
        <span class="stat-value">{{ unverifiedCount }}</span>
        <span class="stat-label">Unverified</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-controls {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.controls-header h2 {
  margin: 0 0 0.75rem;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status-icon {
  font-size: 1.4rem;
}

.mode-badge {
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-family: monospace;
}

.button-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.mode-hint {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-scan {
  background: #8b5cf6;
  color: white;
}

.btn-scan:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-text-muted);
  color: white;
}

.error-banner {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #991b1b;
  font-size: 0.85rem;
  line-height: 1.5;
}

.stats-bar {
  display: flex;
  gap: 1.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-verified .stat-value {
  color: #22c55e;
}

.stat-unverified .stat-value {
  color: #f59e0b;
}
</style>
