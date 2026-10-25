import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Real Git refs in an isolated local bare origin; never pushes to GitHub.
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-release-source-'));
  const origin = join(directory, 'origin.git'), source = join(directory, 'source'), verifier = join(directory, 'verifier');
  const globalConfig = join(directory, 'empty-config'); writeFileSync(globalConfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0' };
  const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, windowsHide: true, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  git(directory, ['init', '--bare', origin]); mkdirSync(source); git(source, ['init']);
  git(source, ['config', 'user.name', 'Release source fixture']); git(source, ['config', 'user.email', 'fixture@example.invalid']);
  git(source, ['config', 'commit.gpgsign', 'false']); git(source, ['config', 'tag.gpgsign', 'false']);
  writeFileSync(join(source, 'source.txt'), 'previous\n'); git(source, ['add', 'source.txt']); git(source, ['commit', '-m', 'previous']);
  const previous = git(source, ['rev-parse', 'HEAD']);
  writeFileSync(join(source, 'source.txt'), 'candidate\n'); git(source, ['commit', '-am', 'candidate']); const candidate = git(source, ['rev-parse', 'HEAD']);
  git(source, ['tag', '-a', 'reviewed', '-m', 'reviewed', candidate]); git(source, ['tag', 'wrong', previous]);
  git(source, ['remote', 'add', 'origin', origin]); git(source, ['push', 'origin', 'refs/tags/reviewed', 'refs/tags/wrong']);
  mkdirSync(verifier); git(verifier, ['init']); git(verifier, ['remote', 'add', 'origin', origin]);
  const manifest = join(directory, 'manifest.json');
  const run = (tag: string, sourceCommit = candidate) => {
    writeFileSync(manifest, JSON.stringify({ source: { sourceCommit } }));
    return execFileSync(process.execPath, [resolve('scripts/release/verify-publish-source.mjs'), `--manifest=${manifest}`], { cwd: verifier,
      env: { ...env, RELEASE_VERSION: tag, GITHUB_SHA: candidate }, encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  };
  return { run, git, verifier, previous, candidate };
}
describe('actual release source Git gate', () => {
  it('dereferences the remote annotated tag and ignores a same-named local branch', () => {
    const value = fixture(); const first = JSON.parse(value.run('reviewed')); expect(first.tagCommit).toBe(value.candidate);
    value.git(value.verifier, ['branch', 'reviewed', value.previous]);
    const second = JSON.parse(value.run('reviewed')); expect(second.tagRef).toBe('refs/tags/reviewed'); expect(second.sourceCommit).toBe(value.candidate);
  });
  it('rejects an existing remote tag pointing at a different commit', () => {
    const value = fixture(); expect(() => value.run('wrong')).toThrow(/must match/);
  });
  it('rejects a manifest from a different workflow source', () => {
    const value = fixture(); expect(() => value.run('reviewed', value.previous)).toThrow(/Manifest source differs/);
  });
});
