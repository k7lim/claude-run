import { useState, memo } from "react";
import type { ConversationMessage, ContentBlock } from "@claude-run/shared";
import {
  Lightbulb,
  Wrench,
  Check,
  X,
  FileText,
  Terminal,
  Search,
  Pencil,
  FolderOpen,
  Globe,
  MessageSquare,
} from "lucide-react";
import { sanitizeText } from "../utils";

interface MessageBlockProps {
  message: ConversationMessage;
}

const MessageBlock = memo(function MessageBlock(props: MessageBlockProps) {
  const { message } = props;

  const isUser = message.type === "user";
  const content = message.message?.content;

  const getTextBlocks = (): ContentBlock[] => {
    if (!content || typeof content === "string") {
      return [];
    }
    return content.filter((b) => b.type === "text");
  };

  const getToolBlocks = (): ContentBlock[] => {
    if (!content || typeof content === "string") {
      return [];
    }
    return content.filter(
      (b) =>
        b.type === "tool_use" || b.type === "tool_result" || b.type === "thinking"
    );
  };

  const getVisibleTextBlocks = (): ContentBlock[] => {
    return getTextBlocks().filter(
      (b) => b.text && sanitizeText(b.text).length > 0
    );
  };

  const hasVisibleText = (): boolean => {
    if (typeof content === "string") {
      return sanitizeText(content).length > 0;
    }
    return getVisibleTextBlocks().length > 0;
  };

  const toolBlocks = getToolBlocks();
  const visibleTextBlocks = getVisibleTextBlocks();
  const hasText = hasVisibleText();
  const hasTools = toolBlocks.length > 0;

  if (!hasText && hasTools) {
    return (
      <div className="flex flex-wrap items-center gap-1 py-0.5">
        {toolBlocks.map((block, index) => (
          <ContentBlockRenderer key={index} block={block} />
        ))}
      </div>
    );
  }

  if (!hasText && !hasTools) {
    return null;
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} min-w-0`}>
      <div className="max-w-[85%] min-w-0">
        <div
          className={`px-3.5 py-2.5 rounded-2xl overflow-hidden ${
            isUser
              ? "bg-indigo-600/80 text-indigo-50 rounded-br-md"
              : "bg-cyan-700/50 text-zinc-100 rounded-bl-md"
          }`}
        >
          {typeof content === "string" ? (
            <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
              {sanitizeText(content)}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {visibleTextBlocks.map((block, index) => (
                <ContentBlockRenderer key={index} block={block} isUser={isUser} />
              ))}
            </div>
          )}
        </div>

        {hasTools && (
          <div
            className={`flex flex-wrap gap-1 mt-1.5 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {toolBlocks.map((block, index) => (
              <ContentBlockRenderer key={index} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

interface ContentBlockRendererProps {
  block: ContentBlock;
  isUser?: boolean;
}

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase();
  if (name === "read" || name.includes("read")) {
    return FileText;
  }
  if (name === "bash" || name.includes("bash") || name.includes("shell")) {
    return Terminal;
  }
  if (name === "grep" || name.includes("search") || name.includes("grep")) {
    return Search;
  }
  if (name === "edit" || name === "write" || name.includes("edit") || name.includes("write")) {
    return Pencil;
  }
  if (name === "glob" || name.includes("glob") || name.includes("find")) {
    return FolderOpen;
  }
  if (name.includes("web") || name.includes("fetch") || name.includes("url")) {
    return Globe;
  }
  if (name.includes("ask") || name.includes("question")) {
    return MessageSquare;
  }
  return Wrench;
}

function getToolPreview(toolName: string, input: Record<string, unknown> | undefined): string | null {
  if (!input) {
    return null;
  }

  const name = toolName.toLowerCase();

  if (name === "read" && input.file_path) {
    const filePath = String(input.file_path);
    const parts = filePath.split("/");
    return parts.slice(-2).join("/");
  }

  if (name === "bash" && input.command) {
    const cmd = String(input.command);
    return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
  }

  if (name === "grep" && input.pattern) {
    return `"${String(input.pattern)}"`;
  }

  if (name === "glob" && input.pattern) {
    return String(input.pattern);
  }

  if ((name === "edit" || name === "write") && input.file_path) {
    const filePath = String(input.file_path);
    const parts = filePath.split("/");
    return parts.slice(-2).join("/");
  }

  if (name.includes("web") && input.url) {
    try {
      const url = new URL(String(input.url));
      return url.hostname;
    } catch {
      return String(input.url).slice(0, 30);
    }
  }

  return null;
}

function ContentBlockRenderer(props: ContentBlockRendererProps) {
  const { block } = props;
  const [expanded, setExpanded] = useState(false);

  if (block.type === "text" && block.text) {
    const sanitized = sanitizeText(block.text);
    if (!sanitized) {
      return null;
    }
    return (
      <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
        {sanitized}
      </div>
    );
  }

  if (block.type === "thinking" && block.thinking) {
    return (
      <div className={expanded ? "w-full" : ""}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 text-[11px] text-amber-400/90 transition-colors border border-amber-500/20"
        >
          <Lightbulb size={12} className="opacity-70" />
          <span className="font-medium">thinking</span>
          <span className="text-[10px] opacity-50 ml-0.5">
            {expanded ? "▼" : "▶"}
          </span>
        </button>
        {expanded && (
          <pre className="text-xs text-zinc-400 bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 mt-2 whitespace-pre-wrap max-h-80 overflow-y-auto">
            {block.thinking}
          </pre>
        )}
      </div>
    );
  }

  if (block.type === "tool_use") {
    const input =
      block.input && typeof block.input === "object" ? block.input as Record<string, unknown> : undefined;
    const hasInput = input && Object.keys(input).length > 0;
    const Icon = getToolIcon(block.name || "");
    const preview = getToolPreview(block.name || "", input);

    return (
      <div className={expanded ? "w-full" : ""}>
        <button
          onClick={() => hasInput && setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-500/10 hover:bg-slate-500/15 text-[11px] text-slate-300 transition-colors border border-slate-500/20"
        >
          <Icon size={12} className="opacity-60" />
          <span className="font-medium text-slate-200">{block.name}</span>
          {preview && (
            <span className="text-slate-500 font-normal truncate max-w-[200px]">
              {preview}
            </span>
          )}
          {hasInput && (
            <span className="text-[10px] opacity-40 ml-0.5">
              {expanded ? "▼" : "▶"}
            </span>
          )}
        </button>
        {expanded && hasInput && (
          <pre className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (block.type === "tool_result") {
    const isError = block.is_error;
    const rawContent =
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content, null, 2);
    const resultContent = sanitizeText(rawContent);
    const hasContent = resultContent.length > 0;
    const previewLength = 60;
    const contentPreview = hasContent && !expanded
      ? resultContent.slice(0, previewLength) + (resultContent.length > previewLength ? "..." : "")
      : null;

    return (
      <div className={expanded ? "w-full" : ""}>
        <button
          onClick={() => hasContent && setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors border ${
            isError
              ? "bg-rose-500/10 hover:bg-rose-500/15 text-rose-400/90 border-rose-500/20"
              : "bg-teal-500/10 hover:bg-teal-500/15 text-teal-400/90 border-teal-500/20"
          }`}
        >
          {isError ? (
            <X size={12} className="opacity-70" />
          ) : (
            <Check size={12} className="opacity-70" />
          )}
          <span className="font-medium">{isError ? "error" : "result"}</span>
          {contentPreview && (
            <span className={`font-normal truncate max-w-[200px] ${isError ? "text-rose-500/70" : "text-teal-500/70"}`}>
              {contentPreview}
            </span>
          )}
          {hasContent && (
            <span className="text-[10px] opacity-40 ml-0.5">
              {expanded ? "▼" : "▶"}
            </span>
          )}
        </button>
        {expanded && hasContent && (
          <pre
            className={`text-xs rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all max-h-80 overflow-y-auto border ${
              isError
                ? "bg-rose-950/30 text-rose-200/80 border-rose-900/30"
                : "bg-teal-950/30 text-teal-200/80 border-teal-900/30"
            }`}
          >
            {resultContent.slice(0, 2000)}
            {resultContent.length > 2000 ? "..." : ""}
          </pre>
        )}
      </div>
    );
  }

  return null;
}

export default MessageBlock;
