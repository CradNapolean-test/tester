#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const STATE = {
  IDLE: 'IDLE',
  IN_FILE_HEADER: 'IN_FILE_HEADER',
  IN_CONTENT: 'IN_CONTENT'
};

function fail({ message, lineNumber, state, currentFile, line }) {
  const preview = typeof line === 'string' ? JSON.stringify(line) : '<none>';
  throw new Error(
    `${message}\nline=${lineNumber}\nstate=${state}\nlastFile=${currentFile ?? '<none>'}\nunexpected=${preview}`
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const validateOnly = args.includes('--validate');
  const positional = args.filter((a) => a !== '--validate');

  if (validateOnly) {
    if (positional.length !== 1) {
      throw new Error('Usage: node .\\apply-manifest.mjs --validate .\\manifest.txt');
    }
    return { validateOnly: true, manifestPath: positional[0], outputDir: process.cwd() };
  }

  if (positional.length < 1 || positional.length > 2) {
    throw new Error('Usage: node .\\apply-manifest.mjs .\\manifest.txt [outputDir]');
  }

  return {
    validateOnly: false,
    manifestPath: positional[0],
    outputDir: positional[1] ?? process.cwd()
  };
}

function parseManifest(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];

  let state = STATE.IDLE;
  let currentFile = null;
  let content = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (state === STATE.IDLE) {
      if (line.trim() === '') continue;
      if (!line.startsWith('FILE: ')) {
        fail({ message: 'Expected FILE header starting at column 1', lineNumber, state, currentFile, line });
      }
      currentFile = line.slice('FILE: '.length).trim();
      if (!currentFile) {
        fail({ message: 'FILE header is missing a relative path', lineNumber, state, currentFile, line });
      }
      state = STATE.IN_FILE_HEADER;
      continue;
    }

    if (state === STATE.IN_FILE_HEADER) {
      if (line !== '<<<') {
        fail({ message: 'Expected content start marker <<< on its own line', lineNumber, state, currentFile, line });
      }
      content = [];
      state = STATE.IN_CONTENT;
      continue;
    }

    if (state === STATE.IN_CONTENT) {
      if (line === '>>>') {
        blocks.push({ filePath: currentFile, content: content.join('\n') });
        currentFile = null;
        content = [];
        state = STATE.IDLE;
        continue;
      }

      if (line === '<<<' || line.startsWith('FILE: ')) {
        fail({
          message: 'Detected nested marker inside content; escape marker-like lines with leading \\',
          lineNumber,
          state,
          currentFile,
          line
        });
      }

      if (line === '\\<<<') {
        content.push('<<<');
      } else if (line === '\\>>>') {
        content.push('>>>');
      } else if (line.startsWith('\\FILE:')) {
        content.push(line.slice(1));
      } else {
        content.push(line);
      }
    }
  }

  if (state !== STATE.IDLE) {
    fail({
      message: 'Manifest ended before current file block was closed with >>>',
      lineNumber: lines.length,
      state,
      currentFile,
      line: lines[lines.length - 1] ?? ''
    });
  }

  return blocks;
}

function ensureSafeRelativePath(relPath) {
  if (path.isAbsolute(relPath)) {
    throw new Error(`Refusing absolute path in manifest: ${relPath}`);
  }
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Refusing path traversal in manifest path: ${relPath}`);
  }
}

function writeBlocks(blocks, outputDir) {
  for (const block of blocks) {
    ensureSafeRelativePath(block.filePath);
    const destination = path.join(outputDir, block.filePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, block.content, { encoding: 'utf8' });
  }
}

function main() {
  const { validateOnly, manifestPath, outputDir } = parseArgs(process.argv.slice(2));
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const blocks = parseManifest(manifestText);

  if (validateOnly) {
    console.log(`Manifest OK: ${manifestPath} (${blocks.length} file blocks)`);
    return;
  }

  writeBlocks(blocks, outputDir);
  console.log(`Applied ${blocks.length} files from ${manifestPath} into ${outputDir}`);
}

main();
