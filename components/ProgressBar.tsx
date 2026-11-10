"use client";

import React from "react";

/** The bar and percentage under the busy screen's cue count. */
function ProgressBar({ progress }: { progress: number }) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-valuenow={Math.round(clampedProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Translation ${Math.round(clampedProgress)}% complete`}
        className="w-full h-1.5 bg-elevated rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      <p className="mt-2 text-right text-sm font-medium text-primary tabular-nums">{Math.round(clampedProgress)}%</p>
    </div>
  );
}

interface TranslationProgressProps {
  current: number;
  total: number;
  language: string;
}

export function TranslationProgress({ current, total, language }: TranslationProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Not a live region: the count changes with every chunk of the stream,
          and announcing each one drowns out everything else. The progress bar
          below still reports the progress to anyone who checks it. */}
      <div className="text-center space-y-1">
        <p className="text-sm text-secondary">
          Translating to <span className="font-medium text-primary">{language}</span>
        </p>
        <p className="text-xs text-muted tabular-nums">{current} of {total} segments</p>
      </div>
      <ProgressBar progress={progress} />
    </div>
  );
}
