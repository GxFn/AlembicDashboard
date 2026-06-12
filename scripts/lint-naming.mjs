// SN1 naming lint (AlembicDashboard): blocks filename-convention stragglers
// per config/naming-lint.json. First matching rule wins (rules are ordered
// most-specific scope first); index.ts(x) barrels and exempt scopes pass;
// exceptions need {file, owner, reason} to exempt a single file.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const config = JSON.parse(readFileSync(path.join(root, 'config', 'naming-lint.json'), 'utf8'));

for (const entry of config.exceptions ?? []) {
  for (const field of ['file', 'owner', 'reason']) {
    if (!entry?.[field]) {
      console.error(`naming lint: exception ${JSON.stringify(entry)} missing '${field}'.`);
      process.exit(1);
    }
  }
}
const exceptionFiles = new Set((config.exceptions ?? []).map((entry) => entry.file));
const barrelNames = new Set(config.barrelNames ?? []);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const violations = [];
let checked = 0;
const scanRoots = [...new Set(config.rules.map((rule) => rule.scope.split('/')[0]))];

for (const scanRoot of scanRoots) {
  for (const filePath of walk(path.join(root, scanRoot))) {
    const relative = path.relative(root, filePath).replaceAll(path.sep, '/');
    const baseName = path.basename(relative);
    if (barrelNames.has(baseName) || exceptionFiles.has(relative)) continue;
    if ((config.exemptScopes ?? []).some((scope) => relative.startsWith(`${scope.scope}/`))) continue;
    const rule = config.rules.find(
      (candidate) => relative.startsWith(`${candidate.scope}/`) && new RegExp(candidate.filePattern).test(baseName),
    );
    if (!rule) continue;
    checked += 1;
    if (!new RegExp(rule.namePattern).test(baseName)) {
      violations.push(`${relative}: violates "${rule.label}" (${rule.namePattern})`);
    }
  }
}

if (violations.length > 0) {
  console.error('naming lint FAILED:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
console.log(`naming lint passed (${checked} files checked; ${exceptionFiles.size} exceptions; generated artifacts exempt by scope).`);
