<script setup lang="ts">
import { computed } from 'vue';
import type { TransportNotification } from '@/protocol/types';
import NotificationCard from './NotificationCard.vue';

const props = defineProps<{
  notifications: readonly TransportNotification[];
  isScanning: boolean;
}>();

const verifiedNotifications = computed(() =>
  props.notifications.filter((n) => n.clientVerified),
);
</script>

<template>
  <div class="notification-list">
    <div v-if="verifiedNotifications.length === 0" class="empty-state">
      <div class="empty-icon">📡</div>
      <h3>No notifications yet</h3>
      <p v-if="!isScanning">
        Tap <strong>Scan All</strong> to start listening.
      </p>
      <p v-else>Scanning for nearby transport beacons…</p>
    </div>

    <TransitionGroup name="list" tag="div" class="cards" v-else>
      <NotificationCard
        v-for="notif in verifiedNotifications"
        :key="notif.receivedAt + '-' + Array.from(notif.notificationId).join(',')"
        :notification="notif"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-list {
  min-height: 120px;
}

.empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 0.75rem;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--color-text);
  font-size: 1.2rem;
}

.empty-state p {
  margin: 0;
  font-size: 1rem;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  transform: translateY(-12px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.list-move {
  transition: transform 0.3s ease;
}
</style>
