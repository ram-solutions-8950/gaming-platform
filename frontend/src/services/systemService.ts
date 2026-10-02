import api from './api';

export interface AppVersionInfo {
  latest_version: string;
  min_version: string;
  download_url: string;
  release_notes: string;
  force_update: boolean;
}

export const systemService = {
  getAppVersion: async (): Promise<AppVersionInfo> => {
    const res = await api.get('/system/app-version');
    return res.data.data;
  },
};
