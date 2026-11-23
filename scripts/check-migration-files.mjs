import { readdirSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
const versions = new Map();
const errors = [];

for (const file of files) {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) {
    errors.push(`Invalid migration filename: ${file}`);
    continue;
  }
  const [, version] = match;
  const previous = versions.get(version);
  if (previous) errors.push(`Duplicate migration version ${version}: ${previous} and ${file}`);
  else versions.set(version, file);
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${files.length} migration files with unique 14-digit versions.\n`);
}
