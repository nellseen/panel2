import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Copy, Download, Search, Trash2, X } from 'lucide-react';
import { TerminalLine } from '../types';
import { parseAnsi, processCarriageReturns, stripAnsi } from '../utils/ansi';
import { formatTimestampTime } from '../utils/formatters';
import { focusRingClasses } from '../styles/tokens';
import { IconButton } from './ui';

export interface TerminalOutputProps {
  lines: TerminalLine[];
  onClear?: () => void;
  isRunning?: boolean;
  currentCommand?: string;
  serverName?: string;
  onNotify?: (title: string, variant?: 'success' | 'info' | 'warning' | 'error', desc?: string) => void;
  className?: string;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  lines,
  onClear,
  isRunning = false,
  currentCommand,
  serverName = 'server',
  onNotify,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Auto-scroll handler
  useEffect(() => {
    if (!userScrolledUp && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If more than 35px away from bottom, assume user is reading past logs
    if (distanceToBottom > 35) {
      setUserScrolledUp(true);
    } else {
      setUserScrolledUp(false);
    }
  }, []);

  const scrollToBottom = () => {
    setUserScrolledUp(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCopyAll = async () => {
    const fullText = lines
      .map((l) => `[${l.timestamp}][${l.stream}] ${stripAnsi(l.text)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(fullText);
      onNotify?.('Copied to clipboard', 'success', `${lines.length} lines copied`);
    } catch {
      onNotify?.('Copy failed', 'error', 'Unable to access clipboard');
    }
  };

  const handleDownloadLog = () => {
    const fullText = lines
      .map((l) => `[${l.timestamp}][${l.stream}] ${stripAnsi(l.text)}`)
      .join('\n');
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${serverName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-terminal-${Date.now()}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify?.('Log downloaded', 'info');
  };

  // Filter lines if search query is active
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const query = searchQuery.toLowerCase();
    return lines.filter((l) => stripAnsi(l.text).toLowerCase().includes(query));
  }, [lines, searchQuery]);

  return (
    <div className={`relative flex flex-col h-full bg-[#060709] select-text font-mono text-xs ${className}`.trim()}>
      {/* Mini toolbar */}
      <div className="px-3 py-1.5 bg-[#0A0C10] border-b border-[#181C24] flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 text-[11px] text-[#8A94A6]">
          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Running:</span>
              <span className="text-[#F3F5F8] max-w-[200px] truncate">{currentCommand}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#697386]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Terminal Ready</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {showSearch ? (
            <div className="flex items-center gap-1 bg-[#12151B] border border-[#262C36] rounded px-1.5 py-0.5">
              <Search className="w-3 h-3 text-[#697386]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                placeholder="Search output..."
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-28 sm:w-36 bg-transparent text-[11px] text-[#F3F5F8] placeholder-[#5B6475] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearch(false);
                }}
                className="text-[#8A94A6] hover:text-[#F3F5F8]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <IconButton
              aria-label="Search output"
              size="sm"
              variant="ghost"
              onClick={() => setShowSearch(true)}
              className="h-6 w-6 text-[#8A94A6] hover:text-[#F3F5F8]"
              icon={<Search className="w-3 h-3" />}
            />
          )}

          <IconButton
            aria-label="Copy terminal buffer"
            size="sm"
            variant="ghost"
            onClick={handleCopyAll}
            className="h-6 w-6 text-[#8A94A6] hover:text-[#F3F5F8]"
            title="Copy buffer"
            icon={<Copy className="w-3 h-3" />}
          />

          <IconButton
            aria-label="Download log file"
            size="sm"
            variant="ghost"
            onClick={handleDownloadLog}
            className="h-6 w-6 text-[#8A94A6] hover:text-[#F3F5F8]"
            title="Download log"
            icon={<Download className="w-3 h-3" />}
          />

          {onClear && (
            <IconButton
              aria-label="Clear display"
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="h-6 w-6 text-[#8A94A6] hover:text-[#F3F5F8]"
              title="Clear display"
              icon={<Trash2 className="w-3 h-3" />}
            />
          )}
        </div>
      </div>

      {/* Output log viewport */}
      <div
        ref={containerRef}
        data-testid="terminal-output"
        onScroll={handleScroll}
        className="flex-1 p-3.5 overflow-y-auto space-y-1 overflow-x-auto leading-relaxed"
      >
        {filteredLines.length === 0 ? (
          <div className="text-[#5B6475] py-8 text-center text-xs">
            {searchQuery ? `No lines matching "${searchQuery}"` : 'Terminal output buffer empty.'}
          </div>
        ) : (
          filteredLines.map((line) => {
            const rawText = processCarriageReturns(line.text);
            const spans = parseAnsi(rawText);

            return (
              <div key={line.id} className="flex items-start gap-2.5 break-all">
                <span className="text-[#4E5666] text-[10.5px] tabular-nums select-none shrink-0 pt-0.5">
                  {formatTimestampTime(line.timestamp)}
                </span>
                <span className="min-w-0 flex-1">
                  {spans.map((span, sIdx) => {
                    const fallbackClass =
                      line.stream === 'stderr'
                        ? 'text-red-400'
                        : line.stream === 'command'
                        ? 'text-[#F3F5F8] font-semibold'
                        : line.stream === 'system'
                        ? 'text-emerald-400'
                        : 'text-[#D0D7E2]';

                    const style: React.CSSProperties = {};
                    if (span.color) style.color = span.color;
                    if (span.bgColor) style.backgroundColor = span.bgColor;

                    return (
                      <span
                        key={sIdx}
                        style={style}
                        className={`${span.color ? '' : fallbackClass} ${span.bold ? 'font-bold' : ''} ${
                          span.dim ? 'opacity-70' : ''
                        } ${span.italic ? 'italic' : ''} ${span.underline ? 'underline' : ''}`}
                      >
                        {span.text}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating Resume Auto-Scroll Button */}
      {userScrolledUp && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={`absolute bottom-3 right-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A212D]/95 border border-[#303848] text-xs font-sans text-emerald-400 shadow-xl backdrop-blur-sm transition-all hover:bg-[#232B3B] ${focusRingClasses}`}
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>Scroll to latest</span>
        </button>
      )}
    </div>
  );
};
