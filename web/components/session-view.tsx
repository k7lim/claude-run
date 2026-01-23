import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { ConversationMessage } from "@claude-run/api";
import { GitBranch } from "lucide-react";
import MessageBlock from "./message-block";
import ScrollToBottomButton from "./scroll-to-bottom-button";

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildBranch(
  messages: ConversationMessage[],
  branchChoices: Map<string, string>
): ConversationMessage[] {
  if (messages.length === 0) return [];

  const childrenMap = new Map<string, ConversationMessage[]>();
  const uuidMap = new Map<string, ConversationMessage>();
  const roots: ConversationMessage[] = [];

  for (const msg of messages) {
    if (msg.uuid) uuidMap.set(msg.uuid, msg);
    const parent = msg.parentUuid;
    if (!parent) {
      roots.push(msg);
    } else {
      const siblings = childrenMap.get(parent) || [];
      siblings.push(msg);
      childrenMap.set(parent, siblings);
    }
  }

  if (roots.length === 0) return messages;

  const chain: ConversationMessage[] = [];
  let current: ConversationMessage | undefined = roots[0];

  while (current) {
    chain.push(current);
    const children = current.uuid ? childrenMap.get(current.uuid) : undefined;
    if (!children || children.length === 0) break;
    const chosen = current.uuid && branchChoices.get(current.uuid);
    current = chosen
      ? children.find((c) => c.uuid === chosen) || children[children.length - 1]
      : children[children.length - 1];
  }

  return chain;
}

function getForkPoints(
  messages: ConversationMessage[]
): Map<string, ConversationMessage[]> {
  const childrenMap = new Map<string, ConversationMessage[]>();
  for (const msg of messages) {
    if (!msg.parentUuid) continue;
    const siblings = childrenMap.get(msg.parentUuid) || [];
    siblings.push(msg);
    childrenMap.set(msg.parentUuid, siblings);
  }
  const forks = new Map<string, ConversationMessage[]>();
  for (const [parentUuid, children] of childrenMap) {
    if (children.length > 1) forks.set(parentUuid, children);
  }
  return forks;
}

const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const SCROLL_THRESHOLD_PX = 100;

interface SessionViewProps {
  sessionId: string;
  onMessagesChange?: (messages: ConversationMessage[]) => void;
}

function SessionView(props: SessionViewProps) {
  const { sessionId, onMessagesChange } = props;

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const isScrollingProgrammaticallyRef = useRef(false);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/conversation/${sessionId}/stream?offset=${offsetRef.current}`
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("messages", (event) => {
      retryCountRef.current = 0;
      const newMessages: ConversationMessage[] = JSON.parse(event.data);
      setLoading(false);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.uuid).filter(Boolean));
        const unique = newMessages.filter((m) => !existingIds.has(m.uuid));
        if (unique.length === 0) {
          return prev;
        }
        offsetRef.current += unique.length;
        return [...prev, ...unique];
      });
    });

    eventSource.onerror = () => {
      eventSource.close();
      setLoading(false);

      if (!mountedRef.current) {
        return;
      }

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current), MAX_RETRY_DELAY_MS);
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(() => connect(), delay);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setMessages([]);
    offsetRef.current = 0;
    retryCountRef.current = 0;

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  const scrollToBottom = useCallback(() => {
    if (!lastMessageRef.current) {
      return;
    }
    isScrollingProgrammaticallyRef.current = true;
    lastMessageRef.current.scrollIntoView({ behavior: "instant" });
    requestAnimationFrame(() => {
      isScrollingProgrammaticallyRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages, autoScroll, scrollToBottom]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const handleScroll = () => {
    if (!containerRef.current || isScrollingProgrammaticallyRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PX;
    setAutoScroll(isAtBottom);
  };

  const [branchChoices, setBranchChoices] = useState<Map<string, string>>(new Map());

  const summary = messages.find((m) => m.type === "summary");
  const allConversation = messages.filter(
    (m) => m.type === "user" || m.type === "assistant"
  );

  const forkPoints = useMemo(() => getForkPoints(allConversation), [allConversation]);
  const conversationMessages = useMemo(
    () => buildBranch(allConversation, branchChoices),
    [allConversation, branchChoices]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto bg-zinc-950"
      >
        <div className="mx-auto max-w-3xl px-4 py-4">
          {summary && (
            <div className="mb-6 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
              <h2 className="text-sm font-medium text-zinc-200 leading-relaxed">
                {summary.summary}
              </h2>
              <p className="mt-2 text-[11px] text-zinc-500">
                {conversationMessages.length} messages
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {conversationMessages.map((message, index) => {
              const branches = message.uuid ? forkPoints.get(message.uuid) : undefined;
              const currentChild = conversationMessages[index + 1];
              return (
                <div
                  key={message.uuid || index}
                  ref={
                    index === conversationMessages.length - 1
                      ? lastMessageRef
                      : undefined
                  }
                >
                  <MessageBlock message={message} />
                  {message.timestamp && (
                    <div
                      className={`mt-0.5 text-[10px] text-zinc-500 ${
                        message.type === "user" ? "text-right" : "text-left"
                      }`}
                    >
                      {formatTimestamp(message.timestamp)}
                    </div>
                  )}
                  {branches && branches.length > 1 && (
                    <div className="flex items-center gap-1.5 mt-1 mb-1 ml-1">
                      <GitBranch size={11} className="text-amber-500/70" />
                      <span className="text-[10px] text-zinc-500">
                        {branches.length} branches
                      </span>
                      <div className="flex gap-0.5 ml-1">
                        {branches.map((b, i) => (
                          <button
                            key={b.uuid || i}
                            onClick={() => {
                              if (!message.uuid || !b.uuid) return;
                              setBranchChoices((prev) => {
                                const next = new Map(prev);
                                next.set(message.uuid!, b.uuid!);
                                return next;
                              });
                            }}
                            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                              currentChild?.uuid === b.uuid
                                ? "bg-amber-500/20 text-amber-300"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!autoScroll && (
        <ScrollToBottomButton
          onClick={() => {
            setAutoScroll(true);
            scrollToBottom();
          }}
        />
      )}
    </div>
  );
}

export default SessionView;
