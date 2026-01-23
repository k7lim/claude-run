import { useState, useMemo, memo, useRef, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Session, SessionTokens, SearchResult } from "@claude-run/api";
import { formatTime, formatTokens } from "../utils";

interface SessionListProps {
  sessions: Session[];
  selectedSession: string | null;
  onSelectSession: (sessionId: string) => void;
  loading?: boolean;
  tokens?: Record<string, SessionTokens>;
  onVisibleSessionsChange?: (ids: string[]) => void;
}

type SortBy = "last" | "first";

const SessionList = memo(function SessionList(props: SessionListProps) {
  const { sessions, selectedSession, onSelectSession, loading, tokens, onVisibleSessionsChange } = props;
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("last");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data: SearchResult[]) => {
          setSearchResults(data);
          setSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearching(false);
        });
    }, 300);
  }, []);

  useEffect(() => {
    doSearch(search);
  }, [search, doSearch]);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (search.trim() && search.length < 3) {
      const query = search.toLowerCase();
      result = sessions.filter(
        (s) =>
          s.display.toLowerCase().includes(query) ||
          s.projectName.toLowerCase().includes(query)
      );
    }
    if (sortBy === "first") {
      return [...result].sort((a, b) => (b.firstTimestamp ?? 0) - (a.firstTimestamp ?? 0));
    }
    return [...result].sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions, search, sortBy]);

  const virtualizer = useVirtualizer({
    count: filteredSessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 90,
    overscan: 10,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (onVisibleSessionsChange && virtualItems.length > 0) {
      const visibleIds = virtualItems.map((item) => filteredSessions[item.index]?.id).filter(Boolean);
      onVisibleSessionsChange(visibleIds);
    }
  }, [virtualItems, filteredSessions, onVisibleSessionsChange]);

  return (
    <div className="h-full overflow-hidden bg-zinc-950 flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2 text-zinc-500">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[10px] text-zinc-600 mr-1">Sort:</span>
          <button
            onClick={() => setSortBy("last")}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              sortBy === "last"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Latest
          </button>
          <button
            onClick={() => setSortBy("first")}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              sortBy === "first"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Created
          </button>
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {loading || searching ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="w-5 h-5 text-zinc-600 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : searchResults !== null ? (
          searchResults.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              No results found
            </p>
          ) : (
            <div className="flex flex-col">
              {searchResults.map((result) => (
                <button
                  key={result.sessionId}
                  onClick={() => onSelectSession(result.sessionId)}
                  className={`px-3 py-3 text-left transition-colors border-b border-zinc-800/40 ${
                    selectedSession === result.sessionId
                      ? "bg-cyan-700/30"
                      : "hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 font-medium">
                      {result.projectName}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatTime(result.timestamp)}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-300 leading-snug line-clamp-1 break-words mb-1">
                    {result.display}
                  </p>
                  {result.matches.slice(0, 2).map((match, i) => (
                    <p
                      key={i}
                      className="text-[11px] text-zinc-500 leading-snug line-clamp-2 break-words mt-0.5"
                    >
                      <span className="text-zinc-600 font-medium">
                        {match.role === "user" ? "You" : "Claude"}:
                      </span>{" "}
                      {match.text}
                    </p>
                  ))}
                </button>
              ))}
            </div>
          )
        ) : filteredSessions.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-600">
            {search ? "No sessions match" : "No sessions found"}
          </p>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const session = filteredSessions[virtualItem.index];
              const sessionTokenData = tokens?.[session.id];
              // inputTokens now represents the current context size
              const contextSize = sessionTokenData?.inputTokens || null;
              return (
                <button
                  key={session.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onSelectSession(session.id)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className={`px-3 py-3.5 text-left transition-colors overflow-hidden border-b border-zinc-800/40 ${
                    selectedSession === session.id
                      ? "bg-cyan-700/30"
                      : "hover:bg-zinc-900/60"
                  } ${virtualItem.index === 0 ? "border-t border-t-zinc-800/40" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 font-medium">
                      {session.projectName}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatTime(session.timestamp)}
                      {contextSize !== null && ` · ${formatTokens(contextSize)}`}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-300 leading-snug line-clamp-2 break-words">
                    {session.display}
                  </p>
                  {session.firstTimestamp && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-zinc-600">
                        Created {formatTime(session.firstTimestamp)}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-zinc-800/60">
        <div className="text-[10px] text-zinc-600 text-center">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
});

export default SessionList;
