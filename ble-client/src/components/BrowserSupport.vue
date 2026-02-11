<script setup lang="ts">
defineProps<{
  isSupported: boolean;
}>();
</script>

<template>
  <div v-if="!isSupported" class="support-warning">
    <h3>⚠️ Browser Not Supported</h3>
    <p>
      <strong>Web Bluetooth</strong> is required. Use
      <strong>Google Chrome</strong> or <strong>Edge</strong> and enable:
    </p>
    <code>chrome://flags/#enable-experimental-web-platform-features</code>
    <p>Restart the browser after enabling the flag.</p>
  </div>
</template>

<style scoped>
.support-warning {
  background: #fffbeb;
  border: 1px solid #fbbf24;
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  color: #78350f;
}

.support-warning h3 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.support-warning p {
  margin: 0.5rem 0;
  font-size: 1rem;
  line-height: 1.6;
}

.support-warning code {
  display: block;
  background: #fef3c7;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  font-size: 0.8rem;
  word-break: break-all;
  margin: 0.5rem 0;
}
</style>
