import type { FormAnalyticsSummary, RecentSetInsight } from '../types/app';

type InsightLike = Pick<
  FormAnalyticsSummary,
  'analyzedReps' | 'avgQualityScore' | 'avgDepth' | 'avgCycleMs' | 'consistencyScore'
>;

export function formatAnalysisDurationMs(value: number | null): string {
  if (value == null) {
    return 'Not enough data';
  }

  return `${(value / 1000).toFixed(2)}s`;
}

export function formatAnalysisPercent(value: number | null): string {
  if (value == null) {
    return 'Not enough data';
  }

  return `${Math.round(value * 100)}%`;
}

export function formatAnalysisScore(value: number | null): string {
  if (value == null) {
    return 'Not enough data';
  }

  return `${Math.round(value)}/100`;
}

export function getFormTakeaway(summary: InsightLike): string {
  if (summary.analyzedReps === 0) {
    return 'Need a few auto-counted reps before the app can score your form.';
  }

  if (summary.avgDepth != null && summary.avgDepth < 0.6) {
    return 'Go a little deeper on each rep to improve the set quality.';
  }

  if (summary.consistencyScore != null && summary.consistencyScore < 65) {
    return 'Try to keep the same pace from rep to rep for smoother form.';
  }

  if (summary.avgCycleMs != null && summary.avgCycleMs < 900) {
    return 'Slow the reps slightly for cleaner counting and steadier form.';
  }

  if (summary.avgCycleMs != null && summary.avgCycleMs > 2300) {
    return 'Tempo is controlled. You can speed up a touch if that feels natural.';
  }

  if ((summary.avgQualityScore ?? 0) >= 85) {
    return 'Strong set. Depth and tempo both looked consistent.';
  }

  if ((summary.avgQualityScore ?? 0) >= 70) {
    return 'Solid set. A bit more depth or consistency will lift the score.';
  }

  return 'Form is being tracked. Keep your chest square and finish each rep cleanly.';
}

export function getSetSummaryLine(insight: RecentSetInsight): string {
  if (insight.analyzedReps === 0) {
    return 'Saved, but no auto-counted reps were captured for form scoring.';
  }

  return `${formatAnalysisScore(insight.avgQualityScore)} form, ${formatAnalysisPercent(
    insight.avgDepth
  )} depth, ${formatAnalysisDurationMs(insight.avgCycleMs)} tempo`;
}
