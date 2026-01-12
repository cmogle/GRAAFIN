#!/usr/bin/env node
/**
 * Build script to inject API URL into config.js
 * Usage: node build-config.js
 * 
 * Reads API_URL from environment variable and replaces placeholder in config.js
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.js');
const apiUrl = process.env.API_URL || 'https://graafin-web.onrender.com/api';

// Read current config
let config = fs.readFileSync(configPath, 'utf8');

// Replace placeholder with actual API URL
config = config.replace(
  /window\.API_BASE = window\.API_BASE \|\| '[^']*';/,
  `window.API_BASE = window.API_BASE || '${apiUrl}';`
);

// Write back
fs.writeFileSync(configPath, config, 'utf8');

console.log(`✓ Updated config.js with API_URL: ${apiUrl}`);
