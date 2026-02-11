<script setup lang="ts">
import type { BleStatus, ScanMode } from '@/composables/useBluetooth';

defineProps<{
  status: BleStatus;
  activeMode: ScanMode | null;
  isScanning: boolean;
  isSupported: boolean;
  supportsScan: boolean;
  errorMessage: string | null;
  totalCount: number;
  verifiedCount: number;
  unverifiedCount: number;
}>();

defineEmits<{
  startScan: [];
  stopScan: [];
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
    <div class="status-row">
      <span class="status-icon">{{ statusIcon[status] }}</span>
      <span class="status-text">{{ statusLabel[status] }}</span>
    </div>

    <div v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
    </div>

    <!-- Big action buttons -->
    <div class="button-group">
      <template v-if="!isScanning">
        <button
          class="btn btn-primary"
          :disabled="!supportsScan"
          @click="$emit('startScan')"
        >
          📡 Start Scan
        </button>
      </template>
      <template v-else>
        <button class="btn btn-danger" @click="$emit('stopAll')">
          ⏹ Stop Scan
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

    <!-- Stats -->
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
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.status-icon {
  font-size: 1.75rem;
}

.status-text {
  font-size: 1.25rem;
  font-weight: 700;
}

.button-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn {
  flex: 1;
  min-width: 0;
  padding: 1rem 0.75rem;
  border: none;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  touch-action: manipulation;
}

.btn:active {
  transform: scale(0.96);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-scan {
  background: #8b5cf6;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
  flex: 0 0 auto;
  padding-left: 1.25rem;
  padding-right: 1.25rem;
}

.error-banner {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  color: #991b1b;
  font-size: 0.95rem;
  line-height: 1.5;
}

.stats-bar {
  display: flex;
  justify-content: space-around;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 800;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.15rem;
}

.stat-verified .stat-value {
  color: #22c55e;
}

.stat-unverified .stat-value {
  color: #f59e0b;
}
</style>
