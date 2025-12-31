import { useEffect, useState, useRef } from "react";
import type { ConversationMessage } from "@claude-run/shared";
import MessageBlock from "./message-block";

interface SessionViewProps {
  sessionId: string;
}

function SessionView(props: SessionViewProps) {
  const { sessionId } = props;

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setMessages([]);

    fetch(`/api/conversation/${sessionId}`)
      .then((res) => res.json())
      .then((data: ConversationMessage[]) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch messages:", err);
        setLoading(false);
      });

    const eventSource = new EventSource(
      `/api/conversation/${sessionId}/stream?offset=0`
    );

    eventSource.addEventListener("messages", (event) => {
      const newMessages: ConversationMessage[] = JSON.parse(event.data);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.uuid).filter(Boolean));
        const unique = newMessages.filter((m) => !existingIds.has(m.uuid));
        if (unique.length === 0) {
          return prev;
        }
        return [...prev, ...unique];
      });
    });

    eventSource.onerror = () => {
      console.error("SSE connection error");
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (autoScroll && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  };

  const summary = messages.find((m) => m.type === "summary");
  const conversationMessages = messages.filter(
    (m) => m.type === "user" || m.type === "assistant"
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
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
          {conversationMessages.map((message, index) => (
            <div
              key={message.uuid || index}
              ref={
                index === conversationMessages.length - 1
                  ? lastMessageRef
                  : undefined
              }
            >
              <MessageBlock message={message} />
            </div>
          ))}
        </div>

        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              lastMessageRef.current?.scrollIntoView({ behavior: "instant" });
            }}
            className="fixed bottom-4 right-6 rounded-full bg-zinc-200/90 px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-lg transition-all hover:bg-zinc-100 flex items-center gap-1.5 backdrop-blur-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span>Latest</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default SessionView;
