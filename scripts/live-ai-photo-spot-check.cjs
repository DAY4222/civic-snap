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
const LIVE_SAMPLE_CHECK = DEFAULT_CHECKS[1];

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main() {
  const env = loadEnv();
  const functionUrl = env.EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!functionUrl || !anonKey) {
    throw new Error(
      'Set EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first.'
    );
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
    if (!Array.isArray(result.issueCandidates)) {
      console.log(
        `WARN ${path.relative(ROOT, absolutePath)} returned no issueCandidates. promptVersion=${result.promptVersion ?? 'unknown'}`
      );
    }
    const passed = checkResultPassed(check, result);

    if (!passed) failures += 1;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${path.relative(ROOT, absolutePath)}`);
    console.log(formatAnalysisDiagnostics({ check, imagePath: absolutePath, result }));
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

function checkResultPassed(check, result) {
  const topThree = getTopIssueCandidates(result);
  if (check.expectedIssueId) {
    return topThree.some(
      (candidate) =>
        candidate.issueId === check.expectedIssueId &&
        Array.isArray(candidate.supportingLabelIds) &&
        candidate.supportingLabelIds.length > 0
    );
  }

  return (
    topThree.length > 0 &&
    Array.isArray(topThree[0].supportingLabelIds) &&
    topThree[0].supportingLabelIds.length > 0
  );
}

function getTopIssueCandidates(result) {
  return Array.isArray(result?.issueCandidates) ? result.issueCandidates.slice(0, 3) : [];
}

function formatAnalysisDiagnostics({ check, imagePath, result, responseJsonPath }) {
  const labels = Array.isArray(result?.suggestedLabels) ? result.suggestedLabels.slice(0, 10) : [];
  const candidates = getTopIssueCandidates(result);
  const image = result?.image ?? {};
  const lines = [
    `Live AI photo sample: ${path.relative(ROOT, imagePath)}`,
    `Expected issue: ${check.expectedIssueId ?? 'any supported issue candidate'}`,
    '',
    'Returned metadata:',
    [
      `provider=${formatValue(result?.provider)}`,
      `model=${formatValue(result?.model)}`,
      `promptVersion=${formatValue(result?.promptVersion)}`,
      `taxonomyVersion=${formatValue(result?.taxonomyVersion)}`,
      `issueCatalogVersion=${formatValue(result?.issueCatalogVersion)}`,
      `latencyMs=${formatValue(result?.latencyMs)}`,
    ].join(' '),
    `image=${formatValue(image.width)}x${formatValue(image.height)} bytes=${formatValue(
      image.bytes
    )} mime=${formatValue(image.mimeType)}`,
    '',
    'Top labels:',
  ];

  if (labels.length === 0) {
    lines.push('  none');
  } else {
    for (const [index, label] of labels.entries()) {
      lines.push(
        `  ${index + 1}. ${formatValue(label.label || label.id)} (${formatConfidence(
          label.confidence
        )}) evidence="${formatValue(label.evidence)}"`
      );
    }
  }

  lines.push('', 'Issue cards app would show:');
  if (candidates.length === 0) {
    lines.push('  none');
  } else {
    for (const [index, candidate] of candidates.entries()) {
      const evidenceChips = Array.isArray(candidate.evidenceChips)
        ? candidate.evidenceChips.join(', ')
        : '';
      const supportingLabelIds = Array.isArray(candidate.supportingLabelIds)
        ? candidate.supportingLabelIds.join(',')
        : '';

      lines.push(
        `  ${index + 1}. ${formatValue(candidate.title || candidate.issueId)} [${formatValue(
          candidate.confidenceTier
        )}]`
      );
      lines.push(`     issueId=${formatValue(candidate.issueId)}`);
      lines.push(`     evidence=${evidenceChips || 'none'}`);
      if (supportingLabelIds) lines.push(`     supportingLabelIds=${supportingLabelIds}`);
      lines.push(`     reason=${formatValue(candidate.reason)}`);
      lines.push(`     suggestedDescription=${formatValue(candidate.suggestedDescription)}`);
    }
  }

  if (responseJsonPath) {
    lines.push('', 'Full response JSON:', `  ${responseJsonPath}`);
  }

  return lines.join('\n');
}

function formatConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : 'n/a';
}

function formatValue(value) {
  if (value == null || value === '') return 'unknown';
  return String(value);
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

module.exports = {
  DEFAULT_CHECKS,
  LIVE_SAMPLE_CHECK,
  ROOT,
  analyzeImage,
  checkResultPassed,
  formatAnalysisDiagnostics,
  imageChecksFromArgs,
  loadEnv,
  mimeTypeFor,
};
