import type { ConversationMessage, ContentBlock } from "@claude-run/api";
import { sanitizeText } from "../utils";

function formatToolUse(block: ContentBlock): string {
  const name = block.name || "Unknown Tool";
  const input = block.input as Record<string, unknown> | undefined;

  let content = `**[Tool: ${name}]**\n`;

  if (!input) {
    return content;
  }

  // Extract key input based on tool type
  if (name === "Bash" && input.command) {
    content += "```bash\n" + input.command + "\n```";
  } else if (name === "Read" && input.file_path) {
    content += `\`${input.file_path}\``;
  } else if (name === "Write" && input.file_path) {
    content += `\`${input.file_path}\``;
  } else if (name === "Edit" && input.file_path) {
    content += `\`${input.file_path}\``;
  } else if (name === "Glob" && input.pattern) {
    content += `Pattern: \`${input.pattern}\``;
  } else if (name === "Grep" && input.pattern) {
    content += `Pattern: \`${input.pattern}\``;
  } else if (name === "Task" && input.prompt) {
    const prompt = String(input.prompt);
    const truncated = prompt.length > 200 ? prompt.slice(0, 200) + "..." : prompt;
    content += truncated;
  } else {
    // For other tools, show a compact JSON of key fields
    const keyFields = ["query", "url", "prompt", "path", "file_path", "pattern"];
    const shown: Record<string, unknown> = {};
    for (const key of keyFields) {
      if (key in input) {
        shown[key] = input[key];
      }
    }
    if (Object.keys(shown).length > 0) {
      content += "```json\n" + JSON.stringify(shown, null, 2) + "\n```";
    }
  }

  return content;
}

function formatContentBlock(block: ContentBlock): string | null {
  switch (block.type) {
    case "text":
      return block.text ? sanitizeText(block.text) : null;

    case "thinking":
      if (!block.thinking) return null;
      return `<details>\n<summary>Thinking...</summary>\n\n${block.thinking}\n\n</details>`;

    case "tool_use":
      return formatToolUse(block);

    case "tool_result":
      // Only include tool results if they're errors
      if (block.is_error && block.content) {
        const errorContent = typeof block.content === "string"
          ? block.content
          : JSON.stringify(block.content);
        return `**[Error]**\n\`\`\`\n${errorContent}\n\`\`\``;
      }
      return null;

    default:
      return null;
  }
}

function formatMessage(message: ConversationMessage): string | null {
  if (message.type !== "user" && message.type !== "assistant") {
    return null;
  }

  const role = message.type === "user" ? "User" : "Assistant";
  const content = message.message?.content;

  if (!content) {
    return null;
  }

  let formattedContent = "";

  if (typeof content === "string") {
    formattedContent = sanitizeText(content);
  } else if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const formatted = formatContentBlock(block);
      if (formatted) {
        parts.push(formatted);
      }
    }
    formattedContent = parts.join("\n\n");
  }

  if (!formattedContent.trim()) {
    return null;
  }

  return `## ${role}\n\n${formattedContent}`;
}

export function conversationToMarkdown(messages: ConversationMessage[]): string {
  const parts: string[] = ["# Conversation"];

  const conversationMessages = messages.filter(
    (m) => m.type === "user" || m.type === "assistant"
  );

  for (const message of conversationMessages) {
    const formatted = formatMessage(message);
    if (formatted) {
      parts.push(formatted);
    }
  }

  return parts.join("\n\n---\n\n");
}
