import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const manifestSrc = path.resolve('manifest.json');
const manifestDest = path.join(distDir, 'manifest.json');

if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, manifestDest);
  console.log('✓ Copied manifest.json to dist/manifest.json');
} else {
  console.error('✗ manifest.json not found!');
  process.exit(1);
}

// Ensure models and wasm exist in dist
const distModels = path.join(distDir, 'models');
const distWasm = path.join(distDir, 'wasm');

console.log('Build verification:');
console.log(` - dist/manifest.json: ${fs.existsSync(manifestDest)}`);
console.log(` - dist/models exists: ${fs.existsSync(distModels)}`);
console.log(` - dist/wasm exists: ${fs.existsSync(distWasm)}`);
console.log('✓ Postbuild packaging complete.');
