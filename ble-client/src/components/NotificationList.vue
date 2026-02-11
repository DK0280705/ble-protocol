<script setup lang="ts">
import type { TransportNotification } from '@/protocol/types';
import NotificationCard from './NotificationCard.vue';

defineProps<{
  notifications: readonly TransportNotification[];
  isScanning: boolean;
}>();
</script>

<template>
  <div class="notification-list">
    <div v-if="notifications.length === 0" class="empty-state">
      <div class="empty-icon">📡</div>
      <h3>No notifications yet</h3>
      <p v-if="!isScanning">
        Press <strong>Start Scan</strong> to begin listening for BLE
        transport notifications.
      </p>
      <p v-else>Scanning for nearby transport beacons…</p>
    </div>

    <TransitionGroup name="list" tag="div" class="cards-grid" v-else>
      <NotificationCard
        v-for="notif in notifications"
        :key="notif.receivedAt + '-' + Array.from(notif.notificationId).join(',')"
        :notification="notif"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-list {
  min-height: 200px;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--color-text);
}

.empty-state p {
  margin: 0;
  font-size: 0.9rem;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

/* Transition animations */
.list-enter-active {
  transition: all 0.3s ease-out;
}

.list-leave-active {
  transition: all 0.2s ease-in;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.list-move {
  transition: transform 0.3s ease;
}
</style>
