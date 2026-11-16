// Reproducible synthetic structural comparison. No DB access, no user records. Offline by default.
// --live: 2 scenes × (old GPT, compact GPT, compact DeepSeek, compact GPT with living context) = 8 calls.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const live = process.argv.includes('--live');
const directory = 'node_modules/.cache/lounge-structure-comparison';
await mkdir(directory, { recursive: true });
const run = promisify(execFile);
const common = ['--preserve-symlinks', '--preserve-symlinks-main', 'scripts/lounge-dohyun-confidence-probe.mjs', '--cases=greeting,different-tastes', '--max-output=6000', '--raw', ...(live ? ['--live'] : [])];
const plans = [
  { name: 'gpt-before-and-after', args: ['--provider=openai', '--baseline=node_modules/.cache/lounge-scene-structure-before'] },
  { name: 'deepseek-after', args: ['--provider=deepseek', '--variant=after'] },
  { name: 'gpt-after-with-life', args: ['--provider=openai', '--variant=after', '--with-life'] },
];
const report = { syntheticOnly: true, live, plannedCalls: 8, equalOutputBudget: 6000, note: 'Old and new structures differ in state output and example placement as well as prompt size; not an isolated prompt-length experiment.', results: [] };
for (const plan of plans) {
  const output = `${directory}/${plan.name}.json`;
  await run(process.execPath, [...common, ...plan.args, `--out=${output}`], { windowsHide: true, maxBuffer: 2_000_000 });
  const result = JSON.parse(await readFile(output, 'utf8'));
  for (const entry of result.cases) report.results.push({ condition: plan.name === 'gpt-before-and-after' ? entry.variant === 'before' ? 'old-gpt' : 'compact-gpt' : plan.name, ...entry });
  console.log(JSON.stringify({ comparison: plan.name, captured: result.cases.length, live }));
}
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ complete: true, live, results: report.results.length, report: `${directory}/report.json` }));
