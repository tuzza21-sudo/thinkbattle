// Loads a TypeScript module graph from src/ for node tests without a build step.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const cache = new Map();
export function loadTs(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
  const require = specifier => {
    if (!specifier.startsWith('.')) throw new Error(`External import is not available in tests: ${specifier}`);
    const base = resolve(dirname(path), specifier);
    const target = [`${base}.ts`, `${base}/index.ts`].find(existsSync);
    if (!target) throw new Error(`Cannot resolve ${specifier} from ${path}`);
    return loadTs(target);
  };
  new Function('exports', 'require', 'module', output)(module.exports, require, module);
  return module.exports;
}
