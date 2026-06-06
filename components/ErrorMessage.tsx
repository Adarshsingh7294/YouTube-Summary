"use client";

import { AlertCircle, X } from "lucide-react";

export default function ErrorMessage({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 text-red-700/90 dark:text-red-200/90">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded-md p-1 text-red-700/80 transition hover:bg-red-100 dark:text-red-200/80 dark:hover:bg-red-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
