import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import { initLogger } from './lib/logger.js';
import './styles/main.css';
// 函数式组件的样式需手动引入（模板组件由 unplugin-vue-components 自动按需引入）
import 'vant/es/toast/style';
import 'vant/es/dialog/style';

initLogger();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
