#!/usr/bin/env node

/**
 * Verify Firebase Setup Script
 * Checks if all required environment variables are set
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const envPath = join(projectRoot, '.env');

const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

console.log('🔍 Checking Firebase setup...\n');

// Check if .env file exists
try {
  const envContent = readFileSync(envPath, 'utf-8');
  console.log('✅ .env file found\n');

  // Parse .env file
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  // Check each required variable
  let allGood = true;
  const missing = [];
  const placeholder = [];

  requiredVars.forEach(varName => {
    const value = envVars[varName];
    if (!value) {
      missing.push(varName);
      allGood = false;
    } else if (value.includes('your_') || value.includes('paste_')) {
      placeholder.push(varName);
      allGood = false;
    }
  });

  if (missing.length > 0) {
    console.log('❌ Missing environment variables:');
    missing.forEach(v => console.log(`   - ${v}`));
    console.log();
  }

  if (placeholder.length > 0) {
    console.log('⚠️  Variables with placeholder values (need to be replaced):');
    placeholder.forEach(v => console.log(`   - ${v}`));
    console.log();
  }

  if (allGood) {
    console.log('✅ All Firebase environment variables are set!');
    console.log('\n📋 Configuration summary:');
    console.log(`   Project ID: ${envVars.VITE_FIREBASE_PROJECT_ID}`);
    console.log(`   Auth Domain: ${envVars.VITE_FIREBASE_AUTH_DOMAIN}`);
    console.log(`   API Key: ${envVars.VITE_FIREBASE_API_KEY.substring(0, 20)}...`);
    console.log('\n🚀 You can now run: npm run dev');
  } else {
    console.log('❌ Setup incomplete. Please follow SETUP_STEPS.md to complete configuration.');
    process.exit(1);
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('❌ .env file not found!');
    console.log('\n📝 To create it:');
    console.log('   1. Copy .env.example to .env: cp .env.example .env');
    console.log('   2. Edit .env and add your Firebase credentials');
    console.log('   3. See SETUP_STEPS.md for detailed instructions');
  } else {
    console.error('❌ Error reading .env file:', error.message);
  }
  process.exit(1);
}

