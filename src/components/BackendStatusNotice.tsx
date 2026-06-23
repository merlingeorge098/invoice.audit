import { AlertTriangle } from "lucide-react";

interface BackendStatusNoticeProps {
  show: boolean;
}

export function BackendStatusNotice({ show }: BackendStatusNoticeProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Live backend data could not be reached, so the app is temporarily showing seeded
        fallback data to keep the workflow usable.
      </p>
    </div>
  );
}
