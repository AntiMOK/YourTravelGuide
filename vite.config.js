import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Ensures that the output is compatible with older browsers if needed.
    target: 'es2020', 
  },
});
