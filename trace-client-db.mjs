import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const ALIAS = { "@/": "src/" };

function resolveSpec(spec, fromFile) {
  if (spec.startsWith("@/")) return resolve(ROOT, ALIAS["@/"] + spec.slice(2));
  if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
  return null;
}

const clientFiles = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) clientFiles.push(p);
  }
}
import { readdirSync } from "node:fs";
walk(resolve(ROOT, "src"));

const isClient = (f) => readFileSync(f, "utf8").split("\n")[0].trim() === '"use client";';

const memo = new Map();
function findPath(file, target, seen = new Set()) {
  if (memo.has(file)) return memo.get(file);
  if (seen.has(file)) return null;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const re = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const isTypeOnly = Boolean(m[1]);
    const spec = m[3];
    if (spec.startsWith("node:") || spec.startsWith("next") || spec.startsWith("react")) continue;
    const r = resolveSpec(spec, file);
    if (!r) continue;
    let cand = [r, r + ".ts", r + ".tsx", resolve(r, "index.ts"), resolve(r, "index.tsx")].find((x) => existsSync(x) && x.endsWith(".ts") || (existsSync(x) && x.endsWith(".tsx")));
    if (!cand) continue;
    if (cand === target) return [{ from: relative(ROOT, file), spec, typeOnly: isTypeOnly }];
    if (isTypeOnly) continue; // type-only import is erased
    const sub = findPath(cand, target, seen);
    if (sub) return [{ from: relative(ROOT, file), spec, typeOnly: isTypeOnly }, ...sub];
  }
  memo.set(file, null);
  return null;
}

const target = resolve(ROOT, "src/lib/db.ts");
const results = [];
for (const f of clientFiles) {
  if (!isClient(f)) continue;
  const p = findPath(f, target);
  if (p) results.push({ file: relative(ROOT, f), path: p });
}
console.log(JSON.stringify(results, null, 2));
