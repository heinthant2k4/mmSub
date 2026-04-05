import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Myanmar Subtitles',
    description: 'Overlay Burmese subtitles on any video in your browser',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://api.opensubtitles.com/*'],
    web_accessible_resources: [
      {
        resources: ['assets/fonts/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
