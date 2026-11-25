import { FileEdit, FolderOpen, FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n";
import * as api from "@/lib/tauri/api";
import { useAppStore } from "@/stores/useAppStore";

export function WelcomePane() {
  const { locale, addSite, openStandaloneFile, createScratchTab } = useAppStore();
  const msg = getMessages(locale);

  const handleAddSite = async () => {
    const dir = await api.pickDirectory(msg.sidebar.addSite);
    if (dir) await addSite(dir);
  };

  const handleOpenFile = async () => {
    const file = await api.pickMarkdownFile(msg.sidebar.openFile);
    if (file) await openStandaloneFile(file);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white px-6 text-center select-none">
      <div className="max-w-sm space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {msg.appName}
          </h1>
          <p className="text-xs text-zinc-400">{msg.welcome.subtitle}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => void handleAddSite()}>
            <FolderPlus className="h-3.5 w-3.5" />
            {msg.welcome.addSite}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void handleOpenFile()}>
              <FolderOpen className="h-3.5 w-3.5" />
              {msg.welcome.openFile}
            </Button>
            <Button variant="outline" onClick={createScratchTab}>
              <FileEdit className="h-3.5 w-3.5" />
              {msg.welcome.newScratch}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">{msg.welcome.shortcutHint}</p>
      </div>
    </div>
  );
}
