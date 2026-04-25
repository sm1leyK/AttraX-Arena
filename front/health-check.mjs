import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(currentDir, "index.html");
const appPath = join(currentDir, "app.mjs");
const configPath = join(currentDir, "supabase-config.mjs");
const html = readFileSync(htmlPath, "utf8");
const appSource = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";

const errors = [];
const warnings = [];

const pageIds = new Set([...html.matchAll(/\bid=["']page-([^"']+)["']/g)].map((match) => match[1]));
const navigateTargets = [...html.matchAll(/navigate\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingPageTargets = [...new Set(navigateTargets.filter((target) => !pageIds.has(target)))];

if (missingPageTargets.length > 0) {
  errors.push(`Missing page containers for navigate(): ${missingPageTargets.join(", ")}`);
}

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length > 0) {
  errors.push(`Duplicate id values: ${duplicateIds.join(", ")}`);
}

const referencedIds = [...appSource.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingReferencedIds = [...new Set(referencedIds.filter((id) => !ids.includes(id)))];
if (missingReferencedIds.length > 0) {
  errors.push(`Missing DOM ids used by getElementById(): ${missingReferencedIds.join(", ")}`);
}

const malformedClosingTags = [...html.matchAll(/(^|[^<])\/(a|div|span|button|h[1-6]|p|section|nav|main|form)>/gim)];
if (malformedClosingTags.length > 0) {
  errors.push(`Possible malformed closing tags found: ${malformedClosingTags.length}`);
}

const malformedAppClosingTags = [...appSource.matchAll(/(^|[^<])\/(a|div|span|button|h[1-6]|p|section|nav|main|form)>/gim)];
if (malformedAppClosingTags.length > 0) {
  errors.push(`Possible malformed closing tags found in app.mjs templates: ${malformedAppClosingTags.length}`);
}

if (!existsSync(appPath)) {
  errors.push("Missing front/app.mjs");
} else {
  const syntax = spawnSync(process.execPath, ["--check", appPath], { encoding: "utf8" });
  if (syntax.error?.code === "EPERM") {
    warnings.push("Local environment blocked child-process syntax check for app.mjs. Run `node --check front/app.mjs` manually if needed.");
  } else if (syntax.status !== 0) {
    const message = `${syntax.stderr || syntax.stdout || syntax.error?.message || "unknown error"}`.trim();
    errors.push(`app.mjs syntax error: ${message}`);
  }
}

if (!existsSync(configPath)) {
  errors.push("Missing front/supabase-config.mjs");
} else {
  const config = readFileSync(configPath, "utf8");
  if (!/SUPABASE_URL/.test(config) || !/SUPABASE_ANON_KEY/.test(config)) {
    warnings.push("supabase-config.mjs exists but does not export the expected keys.");
  }
  if (/SUPABASE_URL\s*=\s*["']["']/.test(config) || /SUPABASE_ANON_KEY\s*=\s*["']["']/.test(config)) {
    warnings.push("Supabase config is still empty. Live data will not load until keys are filled in.");
  }
}

if (!/app\.mjs/.test(html)) {
  warnings.push("index.html is not loading front/app.mjs.");
}

console.log("AttraX Arena frontend health check");
console.log(`HTML: ${htmlPath}`);
console.log(`App: ${appPath}`);
console.log(`Config: ${configPath}`);
console.log(`Pages: ${[...pageIds].sort().join(", ")}`);

warnings.forEach((warning) => console.warn(`WARN: ${warning}`));

if (errors.length > 0) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exit(1);
}

console.log("OK: frontend file health passed.");
