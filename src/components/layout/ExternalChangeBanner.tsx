import { AlertTriangle, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab } from "@/types";

interface ExternalChangeBannerProps {
  tab: EditorTab;
}

export function ExternalChangeBanner({ tab }: ExternalChangeBannerProps) {
  const { locale, reloadTabFromDisk, dismissExternalChange } = useAppStore();
  const msg = getMessages(locale);

  if (!tab.externalChange) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-900">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="truncate">
          {tab.isDirty ? msg.external.changedDirty : msg.external.changedClean}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="xs"
          variant="outline"
          className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          onClick={() => void reloadTabFromDisk(tab.id)}
        >
          <RefreshCw className="h-3 w-3" />
          {tab.isDirty ? msg.external.reloadOverwrite : msg.external.reload}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="text-amber-700 hover:bg-amber-100"
          onClick={() => dismissExternalChange(tab.id)}
        >
          <X className="h-3 w-3" />
          {msg.external.ignore}
        </Button>
      </div>
    </div>
  );
}
