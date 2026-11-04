<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { PieChart, BarChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([PieChart, BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '240px' },
});

const el = ref(null);
let chart = null;
let ro = null;

onMounted(() => {
  chart = echarts.init(el.value);
  chart.setOption(props.option);
  ro = new ResizeObserver(() => chart && chart.resize());
  ro.observe(el.value);
});
onUnmounted(() => {
  ro?.disconnect();
  chart?.dispose();
  chart = null;
});

watch(
  () => props.option,
  (opt) => chart && chart.setOption(opt, { notMerge: true }),
  { deep: true }
);
</script>

<template>
  <div ref="el" :style="{ height, width: '100%' }"></div>
</template>
