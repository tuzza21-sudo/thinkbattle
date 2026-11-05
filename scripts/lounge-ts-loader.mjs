// Loads a TypeScript module graph from src/ for node tests without a build step.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

// Packages a module under test may use as they are (lunar-javascript: the 사주 calendar, server only).
const packages = new Set(['lunar-javascript']);
const requirePackage = createRequire(import.meta.url);

const cache = new Map();
export function loadTs(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
  const require = specifier => {
    if (packages.has(specifier)) return requirePackage(specifier);
    if (!specifier.startsWith('.')) throw new Error(`External import is not available in tests: ${specifier}`);
    // Sources written for the Node ESM runtime import './module.js' for './module.ts'.
    const base = resolve(dirname(path), specifier.replace(/\.js$/, ''));
    const target = [`${base}.ts`, `${base}/index.ts`].find(existsSync);
    if (!target) throw new Error(`Cannot resolve ${specifier} from ${path}`);
    return loadTs(target);
  };
  new Function('exports', 'require', 'module', output)(module.exports, require, module);
  return module.exports;
}
