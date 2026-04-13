import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getVersion() {
  try {
    return execSync('git describe --tags --always').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000, // gemeinden.json data chunk is ~1.9MB
  },
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
    __HCP_CLIENT_TOKEN__: JSON.stringify(process.env.VITE_HCP_CLIENT_TOKEN || ''),
  },
});
