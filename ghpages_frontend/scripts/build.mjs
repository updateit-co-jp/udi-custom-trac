// Copyright (c) 2006-2026 update it, Inc.
// All rights reserved.
//
// Builds the GitHub Pages site into dist/.
//   1. Converts the repository's reStructuredText documents to HTML bodies
//      with scripts/render_rst.py (docutils).
//   2. Renders the pages with nunjucks templates from src/.
//   3. Copies src/static/ to dist/.
//
// The python interpreter can be overridden with the PYTHON environment
// variable (for example PYTHON=.venv/bin/python).

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const repoRoot = resolve(siteRoot, '..');
const srcDir = join(siteRoot, 'src');
const distDir = join(siteRoot, 'dist');
// A relative path with a directory part (for example .venv/bin/python) is
// resolved from the directory pnpm was started in, not from repoRoot, which is
// the cwd of the python child process.
const pythonEnv = process.env.PYTHON || 'python3';
const python = pythonEnv.includes('/') ? resolve(pythonEnv) : pythonEnv;

// Japanese guides built from reStructuredText in src/docs/.
// `title` is the page heading on the site; the RST title is not used.
const rstPages = [
  { source: 'ghpages_frontend/src/docs/install.rst', output: 'install.html', title: 'インストール手順' },
  { source: 'ghpages_frontend/src/docs/https.rst', output: 'https.html', title: 'HTTPS で公開する' },
  { source: 'ghpages_frontend/src/docs/migration-1.6.rst', output: 'migration-1.6.html', title: '本家の Trac 1.6.x から引っ越してくる' },
  { source: 'ghpages_frontend/src/docs/upgrade.rst', output: 'upgrade.html', title: 'アップグレード手順' },
];

// Pages written directly as templates.
const templatePages = [
  { template: 'index.njk', output: 'index.html', title: '概要・ダウンロード' },
];

const site = {
  name: 'udi-custom-trac',
  repoUrl: 'https://github.com/updateit-co-jp/udi-custom-trac',
  releasesUrl: 'https://github.com/updateit-co-jp/udi-custom-trac/releases',
};

function renderRst(sources) {
  const script = join(here, 'render_rst.py');
  const result = spawnSync(python, [script, ...sources], {
    cwd: repoRoot,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`failed to run ${python}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`render_rst.py failed (exit ${result.status}):\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const env = nunjucks.configure(join(srcDir, 'templates'), {
    autoescape: true,
    throwOnUndefined: true,
  });

  const rendered = renderRst(rstPages.map((p) => join(repoRoot, p.source)));

  for (const page of rstPages) {
    const key = join(repoRoot, page.source);
    const html = env.render('page.njk', {
      site,
      page: { title: page.title, source: page.source },
      body: rendered[key].body,
    });
    writeFileSync(join(distDir, page.output), html, 'utf-8');
  }

  for (const page of templatePages) {
    const html = env.render(page.template, {
      site,
      page: { title: page.title },
    });
    writeFileSync(join(distDir, page.output), html, 'utf-8');
  }

  cpSync(join(srcDir, 'static'), distDir, { recursive: true });

  // Keep GitHub Pages from running Jekyll over the output.
  writeFileSync(join(distDir, '.nojekyll'), '');

  const outputs = [...rstPages, ...templatePages].map((p) => p.output);
  console.log(`built ${outputs.length} pages into ${relative(siteRoot, distDir)}/: ${outputs.join(', ')}`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
