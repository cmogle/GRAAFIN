#!/usr/bin/env node

/**
 * Generate Apple OAuth Secret Key for Supabase
 * 
 * Usage:
 *   node scripts/generate-apple-secret.js
 * 
 * Make sure to set the environment variables or edit the values below:
 *   - APPLE_TEAM_ID
 *   - APPLE_KEY_ID
 *   - APPLE_KEY_FILE (path to .p8 file)
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Get values from environment or set them here
const teamId = process.env.APPLE_TEAM_ID || 'YOUR_TEAM_ID';
const keyId = process.env.APPLE_KEY_ID || 'YOUR_KEY_ID';
const keyFile = process.env.APPLE_KEY_FILE || 'path/to/AuthKey_KEYID.p8';

if (teamId === 'YOUR_TEAM_ID' || keyId === 'YOUR_KEY_ID' || keyFile === 'path/to/AuthKey_KEYID.p8') {
  console.error('❌ Error: Please set the following values:');
  console.error('   - APPLE_TEAM_ID: Your Apple Team ID');
  console.error('   - APPLE_KEY_ID: Your Apple Key ID');
  console.error('   - APPLE_KEY_FILE: Path to your .p8 key file');
  console.error('');
  console.error('Usage:');
  console.error('  APPLE_TEAM_ID=xxx APPLE_KEY_ID=yyy APPLE_KEY_FILE=./AuthKey_xxx.p8 node scripts/generate-apple-secret.js');
  process.exit(1);
}

if (!fs.existsSync(keyFile)) {
  console.error(`❌ Error: Key file not found: ${keyFile}`);
  process.exit(1);
}

try {
  const privateKey = fs.readFileSync(path.resolve(keyFile));
  
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 180 * 24 * 60 * 60; // 180 days
  
  const secret = jwt.sign(
    { 
      iss: teamId,
      iat: now,
      exp: now + expiresIn
    },
    privateKey,
    { 
      algorithm: 'ES256',
      keyid: keyId
    }
  );
  
  console.log('✅ Apple OAuth Secret Key generated:');
  console.log('');
  console.log(secret);
  console.log('');
  console.log('📋 Copy this value to Supabase Dashboard → Settings → Authentication → Apple → Secret Key');
  console.log('');
  console.log('⚠️  Note: This secret expires in 180 days. You\'ll need to regenerate it before expiration.');
  
} catch (error) {
  console.error('❌ Error generating secret:', error.message);
  process.exit(1);
}
