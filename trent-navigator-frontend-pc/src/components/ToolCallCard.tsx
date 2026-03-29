import React, { useState } from 'react';
import type { ToolCallStep } from '../types';

interface ToolCallCardProps {
  step: ToolCallStep;
}

const statusIcon = (status: ToolCallStep['status']) => {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex gap-0.5 items-center">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse-dot"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      );
    case 'success':
      return (
        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'error':
      return (
        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
};

const statusColors: Record<ToolCallStep['status'], string> = {
  running: 'border-yellow-500/40 bg-yellow-500/5',
  success: 'border-green-500/40 bg-green-500/5',
  error: 'border-red-500/40 bg-red-500/5',
};

const ToolCallCard: React.FC<ToolCallCardProps> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);

  const hasDetails =
    Object.keys(step.arguments).length > 0 || step.result != null;

  const elapsed =
    step.endedAt != null
      ? `${((step.endedAt - step.startedAt) / 1000).toFixed(2)}s`
      : null;

  return (
    <div
      className={`rounded-lg border text-xs font-mono transition-all animate-slide-up ${statusColors[step.status]}`}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
      >
        {statusIcon(step.status)}
        <span className="text-gray-200 font-semibold truncate flex-1">
          {step.toolName}
        </span>
        {elapsed && (
          <span className="text-gray-500 ml-auto shrink-0">{elapsed}</span>
        )}
        {hasDetails && (
          <svg
            className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-3 py-2 space-y-2">
          {Object.keys(step.arguments).length > 0 && (
            <div>
              <div className="text-gray-500 mb-1 text-[10px] uppercase tracking-wider">
                Arguments
              </div>
              <pre className="text-gray-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {JSON.stringify(step.arguments, null, 2)}
              </pre>
            </div>
          )}
          {step.result != null && (
            <div>
              <div className="text-gray-500 mb-1 text-[10px] uppercase tracking-wider">
                Result
              </div>
              <pre className="text-gray-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed max-h-48 overflow-y-auto">
                {step.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallCard;
