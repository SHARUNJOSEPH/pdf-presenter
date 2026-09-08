#!/usr/bin/env node
/**
 * scripts/generate-license-key.js
 * Enterprise Standalone & Direct License Key Generator
 * PDF Presenter Suite (https://github.com/SHARUNJOSEPH/pdf-presenter)
 *
 * Generates and cryptographically verifies offline algorithmic license keys (PRO-XXXX-XXXX-XXXX-XXXX)
 * for standalone distribution, direct corporate orders, Gumroad, Stripe, and reseller licenses.
 *
 * Usage:
 *   node scripts/generate-license-key.js [name/email/seed]
 *   node scripts/generate-license-key.js "Enterprise Customer"
 *   node scripts/generate-license-key.js "user@example.com" --count 5
 *   node scripts/generate-license-key.js "Webhook Buyer" --json
 */

const path = require('path');
const licenseModule = require(path.join(__dirname, '..', 'js', 'license-manager.js'));
const { LicenseManager } = licenseModule;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    seed: null,
    count: 1,
    json: false,
    help: false
  };

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--count' || arg === '-n') {
      const next = args[++i];
      options.count = parseInt(next, 10) || 1;
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10) || 1;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.seed = positional.join(' ');
  } else {
    options.seed = 'DIRECT-CLIENT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  return options;
}

function printHelp() {
  console.log(`
PDF Presenter Suite - Enterprise License Key Generator

Usage:
  node scripts/generate-license-key.js [name/email/seed] [options]

Options:
  --count, -n <number>  Generate multiple license keys (default: 1)
  --json                Output results in JSON format (ideal for webhook automation)
  --help, -h            Show this help message

Examples:
  node scripts/generate-license-key.js "Enterprise Customer"
  node scripts/generate-license-key.js "buyer@domain.com"
  node scripts/generate-license-key.js "AV Production Team" --count 3
  node scripts/generate-license-key.js "Stripe-ch_123456" --json
`);
}

function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const results = [];
  const count = Math.max(1, Math.min(options.count, 1000));

  for (let i = 0; i < count; i++) {
    const itemSeed = count === 1 ? options.seed : `${options.seed}-${i + 1}`;
    const key = LicenseManager.generateAlgorithmicKey(itemSeed);
    const isValid = licenseModule.validateLicenseKey(key);

    if (!isValid) {
      console.error(`[ERROR] Generated key validation failed for seed "${itemSeed}": ${key}`);
      process.exit(1);
    }

    results.push({
      key,
      seed: itemSeed,
      tier: 'pro',
      entitlement: 'PDF Presenter Suite Pro Lifetime Unlock',
      verified: isValid,
      generatedAt: new Date().toISOString()
    });
  }

  if (options.json) {
    console.log(JSON.stringify(count === 1 ? results[0] : { total: results.length, keys: results }, null, 2));
    return;
  }

  console.log('\n=============================================================');
  console.log('  🔑 PDF Presenter Suite - Enterprise License Key Generator  ');
  console.log('=============================================================');
  console.log(`  Entitlement: Pro Lifetime Unlock (Unlimited Bitfocus Companion)`);
  console.log(`  Algorithm:   HMAC-SHA256 Cryptographic Offline Verification`);
  console.log(`  Customer:    "${options.seed}"`);
  console.log(`  Generated:   ${new Date().toLocaleString()}`);
  console.log('-------------------------------------------------------------');

  results.forEach((res, index) => {
    if (results.length > 1) {
      console.log(`\n  [License #${index + 1}] (${res.seed})`);
    } else {
      console.log('');
    }
    console.log(`  License Key:  \x1b[32m\x1b[1m${res.key}\x1b[0m`);
    console.log(`  Verification: \x1b[36m${res.verified ? 'PASSED (Cryptographically Valid)' : 'FAILED'}\x1b[0m`);
  });

  console.log('\n-------------------------------------------------------------');
  console.log('  Activation Instructions for Customer:');
  console.log('  1. Launch PDF Presenter Suite on Windows or macOS.');
  console.log('  2. Click the gear icon (Settings) or click "Upgrade to Pro".');
  console.log('  3. Select "Activate Standalone License Key".');
  console.log('  4. Enter the key above and click "Activate".');
  console.log('=============================================================\n');
}

main();
