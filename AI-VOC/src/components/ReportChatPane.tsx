import React from "react";
import { Sparkles, X, User, Bot, BookOpen, HelpCircle, PlusCircle, ChevronRight } from "lucide-react";
import { AppState } from "../types";

interface ReportChatPaneProps {
  state: AppState;
  isChatPaneOpen: boolean;
  isClassifying: boolean;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  onToggleChatPane: () => void;
  onChatSubmit: (e: React.FormEvent) => void;
  onExecuteChatCommand: (val: string) => void;
  bottomChatRef: React.RefObject<HTMLDivElement | null>;
}

export const ReportChatPane: React.FC<ReportChatPaneProps> = ({
  state,
  isChatPaneOpen,
  isClassifying,
  chatInput,
  setChatInput,
  onToggleChatPane,
  onChatSubmit,
  onExecuteChatCommand,
  bottomChatRef
}) => {
  if (!isChatPaneOpen) return null;

  return (
    <aside className="w-full md:w-[320px] lg:w-[380px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col h-[350px] md:h-full shrink-0 z-10 font-sans shadow-lg md:shadow-none no-print">
      
      {/* Chat Panel Header */}
      <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2 flex-row font-sans">
          <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Analyst Chat</h3>
        </div>
        <button 
          onClick={onToggleChatPane}
          className="p-1 rounded-full text-gray-400 hover:text-slate-800 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Collapse Panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messaging Scrolling Box */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {state.chatHistory.length === 0 ? (
          <div className="text-xs text-slate-400 italic text-center py-10 px-4">
            Ask analysis questions or instruct alterations (e.g. "Add ShopeePay to compare" or "Give me Momo issues overview").
          </div>
        ) : (
          state.chatHistory.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
              >
                <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                  <div className={`p-1.5 rounded-full shrink-0 ${isUser ? "bg-slate-100 text-slate-600" : "bg-slate-900 text-white"}`}>
                    {isUser ? (
                      <User className="w-3.5 h-3.5" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className={`max-w-[85%] px-3.5 py-3 rounded-2xl text-xs sm:text-xs leading-relaxed ${
                    isUser
                      ? "bg-blue-50 text-blue-900"
                      : "bg-white text-slate-800 border border-gray-150 shadow-2xs"
                  }`}>
                    <p dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}></p>

                    {/* Citations renderer if present */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-gray-150 space-y-1.5">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1 flex-row">
                          <BookOpen className="w-3 h-3 text-blue-600" />
                          <span>Cited Sources ({msg.citations.length})</span>
                        </div>
                        <div className="space-y-1">
                          {msg.citations.map((cite, cIdx) => (
                            <div key={cIdx} className="text-[10px] text-slate-600 bg-slate-50 border border-gray-100 p-2 rounded">
                              <span className="font-bold text-blue-700 block mb-0.5">
                                {cite.app ? `${cite.app} · ` : ""}{cite.source}
                              </span>
                              <span className="italic">"{cite.text}"</span>
                              {cite.source_url && (
                                <a
                                  href={cite.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block mt-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
                                >
                                  Open source
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {isClassifying && (
          <div className="flex items-center gap-2 text-xs text-slate-550 p-2 text-[11px] rounded bg-slate-50 italic animate-pulse w-max flex-row font-sans">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></div>
            <span>Agent classifying instructions...</span>
          </div>
        )}
        
        {/* Element anchor to slide */}
        <div ref={bottomChatRef}></div>
      </div>

      {/* Messaging prompt submit form */}
      <div className="p-4 border-t border-gray-200 bg-gray-50/70 font-sans">
        {/* Suggested Commands Guide */}
        <div className="mb-3.5 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Quick Actions &amp; Guidelines:
          </p>
          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onExecuteChatCommand("Why is refund a top complaint?")}
              disabled={isClassifying}
              className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-blue-50/70 hover:bg-blue-100/90 border border-blue-250 hover:border-blue-300 text-blue-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Ask: <strong className="font-semibold">"Why is refund a top complaint?"</strong></span>
            </button>
            <button
              type="button"
              onClick={() => onExecuteChatCommand("Add a chart for refund complaints over time.")}
              disabled={isClassifying}
              className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-purple-50/70 hover:bg-purple-100/90 border border-purple-250 hover:border-purple-300 text-purple-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>Modify: <strong className="font-semibold">"Add a chart for refund complaints over time."</strong></span>
            </button>
            <button
              type="button"
              onClick={() => onExecuteChatCommand("Add ZaloPay to compare.")}
              disabled={isClassifying}
              className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-emerald-50/70 hover:bg-emerald-100/90 border border-emerald-250 hover:border-emerald-300 text-emerald-950 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-650 shrink-0" />
              <span>Compare: <strong className="font-semibold">"Add ZaloPay to compare."</strong></span>
            </button>
          </div>
        </div>

        <form onSubmit={onChatSubmit} className="relative font-sans">
          <div className="relative flex items-center bg-white border border-gray-300 rounded-lg h-11 px-3.5 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10">
            <input
              type="text"
              placeholder="Command agent or ask details..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isClassifying}
              className="flex-1 bg-transparent outline-none text-xs text-slate-800 placeholder-gray-400 font-sans"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isClassifying}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-white transition-all ${
                chatInput.trim() && !isClassifying
                  ? "bg-slate-900 hover:bg-slate-800 cursor-pointer animate-fade-in"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              <ChevronRight className="w-4 h-4 cursor-pointer" strokeWidth={3} />
            </button>
          </div>
        </form>
        <p className="text-center text-[9px] text-gray-400 mt-2 uppercase">
          Gemini feedback model is experimental
        </p>
      </div>

    </aside>
  );
};
