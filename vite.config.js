import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const MAX_JS_FILE_BYTES = 500_000

function javascriptSizeBudget() {
  return {
    name: 'javascript-size-budget',
    apply: 'build',
    writeBundle({ dir }) {
      // Include files copied from public as well as generated chunks.
      const oversized = []
      for (const file of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!file.isFile() || !/\.(?:js|mjs|cjs)$/i.test(file.name)) continue
        const path = join(file.parentPath, file.name)
        const { size } = statSync(path)
        if (size > MAX_JS_FILE_BYTES) oversized.push(`${relative(dir, path)} (${size} bytes)`)
      }
      if (oversized.length) {
        this.error(`JavaScript files exceed the ${MAX_JS_FILE_BYTES}-byte limit before gzip:\n${oversized.sort().join('\n')}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), javascriptSizeBudget()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(?:react|react-dom|scheduler)\// },
            { name: 'supabase', test: /node_modules\/@supabase\// },
          ],
        },
      },
    },
  },
})
