/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Generate registry from manifests before build
function manifestPlugin() {
  return {
    name: 'manifest-registry',
    buildStart() {
      execSync('node scripts/build-registry.mjs', { stdio: 'inherit' });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [manifestPlugin(), react()],
  test: {
    globals: true,
    environment: 'node',
  },
})
