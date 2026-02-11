<script setup lang="ts">
defineProps<{
  isSupported: boolean;
}>();
</script>

<template>
  <div v-if="!isSupported" class="support-warning">
    <h3>⚠️ Browser Not Supported</h3>
    <p>
      The <strong>Web Bluetooth Scanning API</strong> is required to receive
      BLE advertisements. This is an experimental API currently available in:
    </p>
    <ul>
      <li>
        <strong>Google Chrome / Edge</strong> — Enable the flag:<br />
        <code>chrome://flags/#enable-experimental-web-platform-features</code>
      </li>
    </ul>
    <p>
      After enabling the flag, restart the browser and ensure the page is
      served over <strong>HTTPS</strong> or <strong>localhost</strong>.
    </p>
  </div>
</template>

<style scoped>
.support-warning {
  background: #fffbeb;
  border: 1px solid #fbbf24;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  color: #78350f;
}

.support-warning h3 {
  margin: 0 0 0.5rem;
}

.support-warning p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  line-height: 1.6;
}

.support-warning ul {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.support-warning li {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.6;
}

.support-warning code {
  display: inline-block;
  background: #fef3c7;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  word-break: break-all;
}
</style>
