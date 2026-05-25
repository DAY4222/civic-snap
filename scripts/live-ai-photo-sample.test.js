const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LIVE_SAMPLE_CHECK,
  ROOT,
  analyzeImage,
  checkResultPassed,
  formatAnalysisDiagnostics,
  loadEnv,
} = require('./live-ai-photo-spot-check.cjs');

const runLiveTest = process.env.RUN_LIVE_AI_PHOTO_TEST === '1';
const liveIt = runLiveTest ? it : it.skip;

jest.setTimeout(60000);

describe('live AI photo sample', () => {
  liveIt('returns the expected pothole issue in the top three candidates', async () => {
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
    const imagePath = path.resolve(ROOT, LIVE_SAMPLE_CHECK.path);
    const result = await analyzeImage({
      anonKey,
      functionUrl,
      imagePath,
      labels: labelTaxonomy.labels,
      taxonomyVersion: labelTaxonomy.version,
    });
    const responseJsonPath = writeLiveResponseJson(result);
    const diagnostics = formatAnalysisDiagnostics({
      check: LIVE_SAMPLE_CHECK,
      imagePath,
      result,
      responseJsonPath,
    });

    console.log(`\n${diagnostics}`);

    if (!checkResultPassed(LIVE_SAMPLE_CHECK, result)) {
      throw new Error(
        `Expected ${LIVE_SAMPLE_CHECK.expectedIssueId} in the top three issue candidates with supporting labels.\n\n${diagnostics}`
      );
    }
  });
});

function writeLiveResponseJson(result) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(os.tmpdir(), `311-mobile-live-ai-photo-sample-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`);
  return filePath;
}
