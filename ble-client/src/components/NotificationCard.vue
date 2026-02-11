<script setup lang="ts">
import {
  type TransportNotification,
  transportTypeLabel,
  transportStatusLabel,
  transportTypeEmoji,
  transportStatusColor,
  formatNotificationId,
  bytesToHex,
} from '@/protocol/types';

const props = defineProps<{
  notification: TransportNotification;
}>();

const id = formatNotificationId(props.notification.notificationId);
const sourceHex = bytesToHex(props.notification.sourceId).toUpperCase();
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
    <div class="card-header">
      <div class="transport-badge" :style="{ background: statusColor }">
        <span class="transport-emoji">{{ emoji }}</span>
        <span class="transport-type">{{ typeLabel }}</span>
      </div>
      <div class="verification-badge" :class="{ ok: notification.clientVerified }">
        {{ notification.clientVerified ? '✓ Verified' : '⚠ Unverified' }}
      </div>
    </div>

    <div class="card-body">
      <div class="status-row">
        <span class="status-label">Status</span>
        <span class="status-value" :style="{ color: statusColor }">
          {{ statusLabel }}
        </span>
      </div>

      <div class="detail-grid">
        <div class="detail">
          <span class="detail-label">Notification ID</span>
          <code class="detail-value">{{ id }}</code>
        </div>
        <div class="detail">
          <span class="detail-label">Source</span>
          <code class="detail-value">{{ sourceHex }}</code>
        </div>
        <div class="detail">
          <span class="detail-label">Event</span>
          <span class="detail-value">{{ notification.eventId }}</span>
        </div>
        <div class="detail">
          <span class="detail-label">Destination</span>
          <span class="detail-value">{{ notification.destinationId }}</span>
        </div>
        <div class="detail">
          <span class="detail-label">Duration</span>
          <span class="detail-value">{{ notification.durationSecs }}s</span>
        </div>
        <div class="detail">
          <span class="detail-label">RSSI</span>
          <span class="detail-value">
            {{ notification.rssi != null ? `${notification.rssi} dBm` : '—' }}
          </span>
        </div>
      </div>
    </div>

    <div class="card-footer">
      <span class="timestamp">{{ receivedTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.notification-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.notification-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.notification-card.verified {
  border-left: 4px solid #22c55e;
}

.notification-card.unverified {
  border-left: 4px solid #f59e0b;
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
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
}

.transport-emoji {
  font-size: 1.1rem;
}

.verification-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  background: #fef3c7;
  color: #92400e;
}

.verification-badge.ok {
  background: #dcfce7;
  color: #166534;
}

.card-body {
  margin-bottom: 0.5rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.status-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-value {
  font-weight: 700;
  font-size: 1rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.detail {
  display: flex;
  flex-direction: column;
}

.detail-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: 0.85rem;
  font-weight: 500;
}

code.detail-value {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
}

.card-footer {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.timestamp {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
