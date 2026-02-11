<script setup lang="ts">
import type { ScanLogEntry } from '@/composables/useBluetooth';

defineProps<{
  log: readonly ScanLogEntry[];
  isScanning: boolean;
}>();
</script>

<template>
  <div class="scan-log">
    <h3>
      📋 Raw Scan Log
      <span class="log-count">({{ log.length }} events)</span>
    </h3>

    <div v-if="log.length === 0 && isScanning" class="log-empty">
      Waiting for advertisements…
    </div>
    <div v-else-if="log.length === 0" class="log-empty">
      No events captured yet. Start a scan.
    </div>

    <div v-else class="log-scroll">
      <div
        v-for="(entry, i) in log"
        :key="i"
        class="log-entry"
        :class="{ ours: entry.isOurs, parsed: entry.parsed }"
      >
        <span class="log-time">{{ entry.timestamp }}</span>
        <span class="log-device">{{ entry.deviceName ?? '(unknown)' }}</span>
        <span class="log-rssi" v-if="entry.rssi != null">{{ entry.rssi }} dBm</span>
        <span class="log-tag" v-if="entry.parsed">✓ PARSED</span>
        <span class="log-tag tag-ours" v-else-if="entry.isOurs">OUR MFG ID</span>
        <br />
        <span class="log-raw">{{ entry.raw }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-log {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1.5rem;
}

.scan-log h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.log-count {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.log-empty {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.log-scroll {
  max-height: 400px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 0.78rem;
  line-height: 1.6;
}

.log-entry {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  word-break: break-all;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-entry.ours {
  background: #eff6ff;
}

.log-entry.parsed {
  background: #f0fdf4;
}

@media (prefers-color-scheme: dark) {
  .log-entry.ours {
    background: #1e293b;
  }
  .log-entry.parsed {
    background: #14281e;
  }
}

.log-time {
  color: var(--color-text-muted);
  margin-right: 0.5rem;
}

.log-device {
  font-weight: 600;
  margin-right: 0.5rem;
}

.log-rssi {
  color: var(--color-text-muted);
  margin-right: 0.5rem;
}

.log-tag {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
}

.log-tag.tag-ours {
  background: #dbeafe;
  color: #1e40af;
}

@media (prefers-color-scheme: dark) {
  .log-tag {
    background: #14532d;
    color: #86efac;
  }
  .log-tag.tag-ours {
    background: #1e3a5f;
    color: #93c5fd;
  }
}

.log-raw {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}
</style>
