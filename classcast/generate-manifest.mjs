#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.next', '.expo', 'dist']);

function parseArgs(argv) {
  if (argv.length < 1 || argv.length > 2) {
    throw new Error('Usage: node .\\generate-manifest.mjs <rootDir> [manifestPath]');
  }
  return {
    rootDir: path.resolve(argv[0]),
    manifestPath: path.resolve(argv[1] ?? 'manifest.txt')
  };
}

function walkFiles(rootDir, currentDir = rootDir, acc = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkFiles(rootDir, path.join(currentDir, entry.name), acc);
      continue;
    }
    if (entry.isFile()) {
      const fullPath = path.join(currentDir, entry.name);
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      acc.push(rel);
    }
  }
  return acc;
}

function escapeContentLine(line) {
  if (line === '<<<') return '\\<<<';
  if (line === '>>>') return '\\>>>';
  if (line.startsWith('FILE:')) return `\\${line}`;
  return line;
}

function normalizeUtf8NoBom(contentBuffer) {
  let text = contentBuffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}

function writeManifest(rootDir, manifestPath) {
  const files = walkFiles(rootDir).sort((a, b) => a.localeCompare(b));

  const out = fs.createWriteStream(manifestPath, {
    encoding: 'utf8',
    flags: 'w'
  });

  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const content = normalizeUtf8NoBom(fs.readFileSync(fullPath));

    out.write(`FILE: ${file}\n`);
    out.write('<<<\n');

    const lines = content.split(/\r\n|\n|\r/);
    const hasTrailingNewline = /\r\n|\n|\r$/.test(content);

    for (let i = 0; i < lines.length; i += 1) {
      const escaped = escapeContentLine(lines[i]);
      out.write(escaped);
      out.write('\n');
    }

    if (!hasTrailingNewline && content.length > 0) {
      // Already guaranteed by per-line writes, kept explicit for rule clarity.
    }

    out.write('>>>\n');
  }

  out.end();
}

function main() {
  const { rootDir, manifestPath } = parseArgs(process.argv.slice(2));
  writeManifest(rootDir, manifestPath);
  console.log(`Manifest written: ${manifestPath}`);
}

main();
