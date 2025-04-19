// File utility functions for reading, writing, clearing JSON and asset files
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function clearJson(filePath) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, '[]', 'utf-8');
}

module.exports = { ensureDir, readJson, writeJson, clearJson };
