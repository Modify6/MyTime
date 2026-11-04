<script setup>
import { computed } from 'vue';
import { useCatalogStore } from '../stores/catalog.js';
import { fmtTime, fmtDur, fmtDayLabel } from '../lib/time.js';

const props = defineProps({
  event: { type: Object, required: true },
  showDay: { type: Boolean, default: false },
});
const emit = defineEmits(['edit']);

const catalog = useCatalogStore();
const running = computed(() => props.event.endAt == null);
const durText = computed(() =>
  running.value ? '进行中' : fmtDur(Math.max(0, props.event.endAt - props.event.startAt))
);
const goalName = computed(() => (props.event.goalId ? catalog.goalName(props.event.goalId) : ''));
const goalColor = computed(() => catalog.goalMap[props.event.goalId]?.color || '#4f6ef7');
</script>

<template>
  <div class="ev-item" @click="emit('edit', event)">
    <div class="ev-time">
      <template v-if="showDay">{{ fmtDayLabel(event.startAt) }}</template>
      <template v-else>{{ fmtTime(event.startAt) }}</template>
      <template v-if="!running">–{{ fmtTime(event.endAt) }}</template>
      <div v-if="showDay" class="muted">{{ fmtTime(event.startAt) }}<template v-if="!running">–{{ fmtTime(event.endAt) }}</template></div>
    </div>
    <div class="ev-main">
      <div class="ev-title">
        {{ event.title }}<span class="ev-dur">{{ durText }}</span>
      </div>
      <div class="ev-chips">
        <span class="chip" :style="{ '--c': catalog.catColor(event.categoryId) }">
          <i class="dot"></i>{{ catalog.catName(event.categoryId) }}
        </span>
        <span v-if="goalName" class="chip" :style="{ '--c': goalColor }"><i class="dot"></i>{{ goalName }}</span>
      </div>
      <div v-if="event.note" class="ev-note">{{ event.note }}</div>
    </div>
  </div>
</template>
