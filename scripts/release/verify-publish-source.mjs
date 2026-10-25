import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { releaseVersion } from './release-store.mjs';

const version = releaseVersion(process.env.RELEASE_VERSION);
const expected = process.env.GITHUB_SHA;
assert.match(expected || '', /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Workflow commit is required');
const file = process.argv.find(arg => arg.startsWith('--manifest='))?.slice(11) || 'release-download/manifest.json';
const manifest = JSON.parse(readFileSync(resolve(file), 'utf8'));
assert.equal(manifest.source?.sourceCommit, expected, 'Manifest source differs from workflow commit');
const tagRef = `refs/tags/${version}`;
const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['fetch', '--no-tags', 'origin', `${tagRef}:${tagRef}`]);
// Use the full tag ref so a branch with the same name cannot affect resolution.
const tagCommit = git(['rev-parse', '--verify', `${tagRef}^{commit}`]);
assert.equal(tagCommit, expected, 'Release tag, manifest source and workflow commit must match');
console.log(JSON.stringify({ passed: true, version, tagRef, tagCommit, sourceCommit: expected }));
