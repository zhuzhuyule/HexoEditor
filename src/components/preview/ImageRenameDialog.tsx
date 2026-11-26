import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getMessages } from "@/lib/i18n";
import { getFileName } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";

export interface SelectedLocalImage {
  absolutePath: string;
  assetUrl: string;
  rawSrc: string;
}

interface ImageRenameDialogProps {
  image: SelectedLocalImage | null;
  onOpenChange: (open: boolean) => void;
  onConfirmRename: (oldAbsPath: string, newName: string) => Promise<void>;
}

export function ImageRenameDialog({
  image,
  onOpenChange,
  onConfirmRename,
}: ImageRenameDialogProps) {
  const locale = useAppStore((s) => s.locale);
  const msg = getMessages(locale);

  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (image) {
      setNewName(getFileName(image.absolutePath));
    }
  }, [image]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image || !newName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirmRename(image.absolutePath, newName.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(image)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{msg.imageRename.title}</DialogTitle>
          <DialogDescription>{msg.imageRename.hint}</DialogDescription>
        </DialogHeader>
        {image && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            <div className="flex max-h-40 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <img
                src={image.assetUrl}
                alt={image.rawSrc}
                className="max-h-36 max-w-full rounded object-contain"
              />
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-medium text-zinc-500">
                {msg.imageRename.currentPath}
              </div>
              <div className="truncate rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600">
                {image.absolutePath}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">
                {msg.imageRename.newNameLabel}
              </label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {msg.sidebar.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={!newName.trim() || submitting}>
                {msg.imageRename.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
