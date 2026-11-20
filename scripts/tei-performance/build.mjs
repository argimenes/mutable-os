import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'vite';
import solid from 'vite-plugin-solid';

const baseline = process.env.TEI_BASELINE_REF;
if (baseline && !execFileSync('git', ['rev-parse', baseline], {encoding:'utf8'}).trim().startsWith('5e2f0f4')) {
  throw Error('The instrumented baseline preparation copy is qualified only for 5e2f0f4.');
}
const originals = new Set([
  'src/history/stage-c-gates/portable.ts',
  'src/persistence/native-session.ts', 'src/persistence/native-resource.ts', 'src/block-tree/resource-identity.ts',
  'src/block-tree/linked-annotations.ts', 'src/block-tree/resource-boundary.ts',
  'src/block-tree/repository.ts', 'src/runtime/linked-annotations.ts',
  'src/reactive-editor/editor.ts',
]);
const baselinePlugin = () => ({
  name: 'qualification-baseline', enforce: 'pre',
  load(id) {
    const file = id.replace(process.cwd() + '/', '');
    if (file === 'src/interchange/tei/native.ts') return readFileSync(new URL('./baseline-native.txt', import.meta.url), 'utf8');
    if (originals.has(file)) return execFileSync('git', ['show', baseline + ':' + file], {encoding:'utf8'});
  },
});
await build({
  configFile: false,
  plugins: [...(baseline ? [baselinePlugin()] : []), solid()],
  resolve: {alias: {'decode-named-character-reference': createRequire(import.meta.url).resolve('decode-named-character-reference')}},
  // Vite runs a separate plugin pipeline for workers. Both realms must use the
  // baseline; overriding only the main bundle produces a misleading hybrid.
  worker: {format: 'es', plugins: baseline ? [baselinePlugin()] : []},
  build: {target: 'esnext', sourcemap: process.env.TEI_SOURCEMAP !== '0', outDir: 'artifacts/tei-performance/site', rollupOptions: {input: 'scripts/tei-performance/index.html'}},
});
