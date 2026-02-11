<script setup lang="ts">
import {
  type TransportNotification,
  transportTypeLabel,
  transportStatusLabel,
  transportTypeEmoji,
  transportStatusColor,
  formatNotificationId,
} from '@/protocol/types';

const props = defineProps<{
  notification: TransportNotification;
}>();

const id = formatNotificationId(props.notification.notificationId);
const typeLabel = transportTypeLabel[props.notification.transportType];
const statusLabel = transportStatusLabel[props.notification.transportStatus];
const emoji = transportTypeEmoji[props.notification.transportType];
const statusColor = transportStatusColor[props.notification.transportStatus];

const receivedTime = new Date(props.notification.receivedAt).toLocaleTimeString();
</script>

<template>
  <div
    class="notification-card"
    :class="{
      verified: notification.clientVerified,
      unverified: !notification.clientVerified,
    }"
  >
    <!-- Top row: transport badge + verification -->
    <div class="card-header">
      <div class="transport-badge" :style="{ background: statusColor }">
        <span class="transport-emoji">{{ emoji }}</span>
        <span class="transport-type">{{ typeLabel }}</span>
      </div>
      <div class="verification-badge" :class="{ ok: notification.clientVerified }">
        {{ notification.clientVerified ? '✓ Verified' : '⚠ Unverified' }}
      </div>
    </div>

    <!-- Big status -->
    <div class="status-display" :style="{ color: statusColor }">
      {{ statusLabel }}
    </div>

    <!-- Key info -->
    <div class="info-row">
      <div class="info-item">
        <span class="info-label">Duration</span>
        <span class="info-value">{{ notification.durationSecs }}s</span>
      </div>
      <div class="info-item">
        <span class="info-label">Dest</span>
        <span class="info-value">{{ notification.destinationId }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">RSSI</span>
        <span class="info-value">
          {{ notification.rssi != null ? `${notification.rssi}` : '—' }}
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div class="card-footer">
      <span class="nid">ID: {{ id }}</span>
      <span class="timestamp">{{ receivedTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.notification-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 1rem 1.15rem;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.notification-card.verified {
  border-left: 5px solid #22c55e;
}

.notification-card.unverified {
  border-left: 5px solid #f59e0b;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.transport-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  border-radius: 24px;
  color: white;
  font-weight: 700;
  font-size: 1rem;
}

.transport-emoji {
  font-size: 1.3rem;
}

.verification-badge {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.3rem 0.7rem;
  border-radius: 14px;
  background: #fef3c7;
  color: #92400e;
}

.verification-badge.ok {
  background: #dcfce7;
  color: #166534;
}

.status-display {
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
}

.info-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.info-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg, #f0f2f5);
  border-radius: 12px;
  padding: 0.5rem 0.25rem;
}

.info-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 1.1rem;
  font-weight: 700;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border);
}

.nid {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.timestamp {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-weight: 600;
}
</style>
