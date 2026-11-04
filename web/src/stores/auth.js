import { defineStore } from 'pinia';
import { api } from '../api/client.js';
import { getServerUrl, setServerUrl, getToken, setToken, isLoggedIn } from '../auth/local.js';
import { useSyncStore } from './sync.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    serverUrl: getServerUrl(),
    hasToken: isLoggedIn(),
    testing: false,
  }),
  actions: {
    async login(serverUrl, password) {
      const url = (serverUrl || '').trim();
      setServerUrl(url);
      this.serverUrl = url;
      const { token } = await api.login(password);
      setToken(token);
      this.hasToken = true;
      useSyncStore().trigger();
    },
    logout() {
      setToken('');
      this.hasToken = false;
    },
    async testConnection(serverUrl) {
      const url = (serverUrl || '').trim();
      setServerUrl(url);
      this.serverUrl = url;
      await api.testConnection();
    },
  },
});
