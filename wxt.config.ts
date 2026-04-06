import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'myanSub',
    description: 'Overlay Myanmar subtitles on any streaming video',
    version: '1.0.0',
    browser_specific_settings: {
      gecko: {
        id: 'myanmar-subtitles@extension',
        strict_min_version: '113.0',
      },
    },
    permissions: ['storage', 'activeTab', 'declarativeNetRequest'],
    host_permissions: [
      'https://api.opensubtitles.com/*',
      'https://api.subdl.com/*',
      'https://dl.subdl.com/*',
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'opensubtitles-headers',
          enabled: true,
          path: 'rules.json',
        },
      ],
    },
    web_accessible_resources: [
      {
        resources: ['fonts/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
