#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

const ROOT = path.resolve(__dirname, '..');
const MAX_IMAGES = 5;
const DEFAULT_CHECKS = [
  {
    path: 'docs/toronto-311-spot-checks/01-road-sinkhole.png',
    expectedIssueId: 'sink-hole',
  },
  {
    path: 'docs/toronto-311-spot-checks/02-road-pothole.png',
    expectedIssueId: 'road-pothole-road-damage',
  },
  {
    path: 'docs/toronto-311-spot-checks/03-oversized-items.png',
    expectedIssueId: 'residential-oversized-electronics-item-day-collection-not-picked-up',
  },
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const env = loadEnv();
  const functionUrl = env.EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!functionUrl || !anonKey) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first.');
  }

  const labelTaxonomy = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/generated/photo-label-taxonomy.json'), 'utf8')
  );
  const checks = imageChecksFromArgs(process.argv.slice(2)).slice(0, MAX_IMAGES);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Run live Gemini photo analysis for ${checks.length} image(s)? This consumes API calls. Type "yes" to continue: `
  );
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  let failures = 0;
  for (const check of checks) {
    const absolutePath = path.resolve(ROOT, check.path);
    let result;
    try {
      result = await analyzeImage({
        anonKey,
        functionUrl,
        imagePath: absolutePath,
        labels: labelTaxonomy.labels,
        taxonomyVersion: labelTaxonomy.version,
      });
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${path.relative(ROOT, absolutePath)}`);
      console.log(`  ${error.message}`);
      continue;
    }
    const topThree = Array.isArray(result.issueCandidates) ? result.issueCandidates.slice(0, 3) : [];
    if (!Array.isArray(result.issueCandidates)) {
      console.log(
        `WARN ${path.relative(ROOT, absolutePath)} returned no issueCandidates. promptVersion=${result.promptVersion ?? 'unknown'}`
      );
    }
    const passed = check.expectedIssueId
      ? topThree.some(
          (candidate) =>
            candidate.issueId === check.expectedIssueId && candidate.supportingLabelIds.length > 0
        )
      : topThree.length > 0 && topThree[0].supportingLabelIds.length > 0;

    if (!passed) failures += 1;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${path.relative(ROOT, absolutePath)}`);
    console.log(
      topThree
        .map(
          (candidate, index) =>
            `  ${index + 1}. ${candidate.issueId} (${candidate.confidenceTier}) labels=${candidate.supportingLabelIds.join(',')}`
        )
        .join('\n')
    );
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

function imageChecksFromArgs(args) {
  if (args.length === 0) return DEFAULT_CHECKS;
  return args.map((arg) => ({ path: arg, expectedIssueId: null }));
}

async function analyzeImage({ anonKey, functionUrl, imagePath, labels, taxonomyVersion }) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      installId: `live-spot-check-${Date.now()}`,
      imageBase64,
      mimeType: mimeTypeFor(imagePath),
      allowedLabels: labels,
      taxonomyVersion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Analysis failed for ${imagePath}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function loadEnv() {
  const env = { ...process.env };
  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;

    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && env[match[1]] == null) {
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return env;
}
