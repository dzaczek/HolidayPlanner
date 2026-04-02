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
  },
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
});
