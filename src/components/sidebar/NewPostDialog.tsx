import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";

interface NewPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPostDialog({ open, onOpenChange }: NewPostDialogProps) {
  const { locale, createNewPost, allCategories, allTags } = useAppStore();
  const msg = getMessages(locale);

  const [title, setTitle] = useState("");
  const [isDraft, setIsDraft] = useState(false);
  const [categoriesInput, setCategoriesInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parseCommaList = (raw: string) =>
    raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createNewPost({
        title: title.trim(),
        isDraft,
        categories: parseCommaList(categoriesInput),
        tags: parseCommaList(tagsInput),
      });
      setTitle("");
      setCategoriesInput("");
      setTagsInput("");
      setIsDraft(false);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const appendChip = (current: string, value: string, setter: (v: string) => void) => {
    const existing = parseCommaList(current);
    if (existing.includes(value)) return;
    setter([...existing, value].join(", "));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{msg.newPost.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              {msg.newPost.postTitleLabel}
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={msg.newPost.postTitlePlaceholder}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              {msg.newPost.typeLabel}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setIsDraft(false)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  !isDraft
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {msg.newPost.typePost}
              </button>
              <button
                type="button"
                onClick={() => setIsDraft(true)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  isDraft
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {msg.newPost.typeDraft}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              {msg.newPost.categoriesLabel}
            </label>
            <Input
              value={categoriesInput}
              onChange={(e) => setCategoriesInput(e.target.value)}
              placeholder="Tech, Rust"
            />
            {allCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {allCategories.slice(0, 6).map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => appendChip(categoriesInput, c.name, setCategoriesInput)}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 cursor-pointer"
                  >
                    + {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              {msg.newPost.tagsLabel}
            </label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Hexo, Markdown"
            />
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {allTags.slice(0, 8).map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => appendChip(tagsInput, t.name, setTagsInput)}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 cursor-pointer"
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            )}
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
            <Button type="submit" size="sm" disabled={!title.trim() || submitting}>
              {msg.newPost.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
