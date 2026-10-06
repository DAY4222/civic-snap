import type { PhotoIssueCandidate } from '@/lib/types';

import type { PhotoVisionStatus } from './reportWizardState';

/** Wording shared by the suggest step and the suggestions panel on Details. */
export function confidenceTierText(tier: PhotoIssueCandidate['confidenceTier']) {
  if (tier === 'strong') return 'Strong match';
  if (tier === 'likely') return 'Likely match';
  return 'Possible match';
}

export function photoSuggestionFallbackText(status: PhotoVisionStatus) {
  if (status === 'rate-limited') {
    return 'Daily photo analysis limit reached. Search all issue types to continue.';
  }

  if (status === 'payload-too-large') {
    return 'This photo is too large for analysis. Search all issue types to continue.';
  }

  if (status === 'offline') {
    return "Photo suggestions can't connect right now. You can still pick the issue type yourself.";
  }

  if (status === 'error') {
    return 'Photo suggestions are unavailable. Search all issue types to continue.';
  }

  return 'No suggested topics available. Search all issue types to continue.';
}
