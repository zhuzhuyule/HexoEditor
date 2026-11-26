import {
  ChevronDown,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Globe,
  Image,
  Images,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";

export type QuickOpenTarget =
  | "post_dir"
  | "post_asset_dir"
  | "images_dir"
  | "site_root"
  | "blog_home"
  | "local_preview";

export interface QuickOpenAvailability {
  postDir?: boolean;
  postAssetDir?: boolean;
  imagesDir?: boolean;
  siteRoot?: boolean;
  blogHome?: boolean;
  localPreview?: boolean;
}

export interface QuickOpenMenuProps {
  availability: QuickOpenAvailability;
  onSelectTarget: (target: QuickOpenTarget) => void;
  locale?: Locale;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  className?: string;
}

export function QuickOpenMenu({
  availability,
  onSelectTarget,
  locale = "zh-CN",
  trigger,
  align = "end",
  disabled = false,
  className,
}: QuickOpenMenuProps) {
  const isEn = locale === "en-US";

  const labels = {
    trigger: isEn ? "Quick Open" : "快捷打开",
    directoriesGroup: isEn ? "Directories" : "本地目录",
    linksGroup: isEn ? "Web Pages" : "站点主页",
    postDir: isEn ? "Current Post Folder" : "本文所在目录",
    postAssetDir: isEn ? "Post Asset Folder" : "本文图片目录",
    imagesDir: isEn ? "Site Images Folder" : "站点图片资源目录",
    siteRoot: isEn ? "Hexo Root Folder" : "Hexo 根目录",
    blogHome: isEn ? "Blog Online Home" : "博客线上主页",
    localPreview: isEn ? "Local Preview Home" : "本地预览主页",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            variant="ghost"
            size="xs"
            disabled={disabled}
            className={cn("gap-1 text-zinc-600 hover:text-zinc-900", className)}
            title={labels.trigger}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>{labels.trigger}</span>
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel>{labels.directoriesGroup}</DropdownMenuLabel>

        <DropdownMenuItem
          disabled={!availability.postDir}
          onSelect={() => onSelectTarget("post_dir")}
        >
          <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.postDir}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!availability.postAssetDir}
          onSelect={() => onSelectTarget("post_asset_dir")}
        >
          <Image className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.postAssetDir}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!availability.imagesDir}
          onSelect={() => onSelectTarget("images_dir")}
        >
          <Images className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.imagesDir}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!availability.siteRoot}
          onSelect={() => onSelectTarget("site_root")}
        >
          <FolderTree className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.siteRoot}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{labels.linksGroup}</DropdownMenuLabel>

        <DropdownMenuItem
          disabled={!availability.blogHome}
          onSelect={() => onSelectTarget("blog_home")}
        >
          <Globe className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.blogHome}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!availability.localPreview}
          onSelect={() => onSelectTarget("local_preview")}
        >
          <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
          <span>{labels.localPreview}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
