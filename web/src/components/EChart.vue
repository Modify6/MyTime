<script setup>
// ECharts 封装：组件级按需加载（echarts 较大，仅在图表真正渲染时才下载该 chunk），
// 加载失败时只影响图表区域，不拖垮页面
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '240px' },
});

const el = ref(null);
const failed = ref(false);
let chart = null;
let ro = null;
let disposed = false;

onMounted(async () => {
  try {
    const [{ PieChart, BarChart, LineChart }, { TooltipComponent, GridComponent, LegendComponent }, { CanvasRenderer }, core] =
      await Promise.all([
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
        import('echarts/core'),
      ]);
    if (disposed || !el.value) return;
    core.use([PieChart, BarChart, LineChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);
    chart = core.init(el.value);
    chart.setOption(props.option);
    ro = new ResizeObserver(() => chart && chart.resize());
    ro.observe(el.value);
  } catch (e) {
    failed.value = true;
    console.error('图表初始化失败', e);
  }
});

onUnmounted(() => {
  disposed = true;
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
  <div ref="el" :style="{ height, width: '100%' }">
    <div v-if="failed" class="muted" style="text-align: center; padding-top: 90px">图表加载失败，请稍后重试</div>
  </div>
</template>
