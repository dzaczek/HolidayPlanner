import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'child_process';

function getVersion() {
  try {
    return execSync('git describe --tags --always').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  // Load .env file explicitly so the token is embedded at build time
  // (process.env alone won't see .env without shell export)
  const env = loadEnv(mode, process.cwd(), '');
  const token = env.VITE_HCP_CLIENT_TOKEN || process.env.VITE_HCP_CLIENT_TOKEN || '';

  return {
    root: '.',
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 2000, // gemeinden.json data chunk is ~1.9MB
    },
    define: {
      __APP_VERSION__: JSON.stringify(getVersion()),
      __HCP_CLIENT_TOKEN__: JSON.stringify(token),
    },
  };
});
