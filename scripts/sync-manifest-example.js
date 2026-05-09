'use strict';

/**
 * manifest.json（ローカルのみ・Git に含めない）から Key を除いた内容で manifest.example.json を上書きする。
 * manifest に Key 以外の変更を Push したいときに実行する。
 *
 *   node scripts/sync-manifest-example.js
 */

const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

execSync('node scripts/version-sync.js write-example', { stdio: 'inherit' });
