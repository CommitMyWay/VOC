import React from "react";
import { Bot, Database } from "lucide-react";
import { AppState } from "../types";

interface ReportHeaderProps {
  state: AppState;
  onReset: () => void;
  onOpenSources: () => void;
  onGeneratePDF: () => void;
  isChatPaneOpen: boolean;
  onToggleChatPane: () => void;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  state,
  onReset,
  onOpenSources,
  onGeneratePDF,
  isChatPaneOpen,
  onToggleChatPane
}) => {
  return (
    <header className="header h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-3 shrink-0 select-none z-20 no-print font-sans">
      <button onClick={onReset} className="back-btn cursor-pointer">
        ← Queries
      </button>
      <div className="h-div w-[1px] h-5 bg-gray-200"></div>
      <div className="header-query font-bold text-slate-800 text-sm truncate max-w-sm font-sans">
        "{state.query}"
      </div>
      
      <div className="cpills flex items-center gap-1.5 hidden md:flex font-sans">
        {state.companies.map((company, index) => {
          const colors = [
            "border-[#b71c5a] text-[#b71c5a] bg-[#fce4ec]", // momo pink
            "border-[#1565c0] text-[#1565c0] bg-[#e3f2fd]", // zalopay blue
            "border-[#c62828] text-[#c62828] bg-[#ffebee]", // vnpay red
            "border-slate-500 text-slate-600 bg-slate-50"
          ];
          const dotColors = ["bg-[#b71c5a]", "bg-[#1565c0]", "bg-[#c62828]", "bg-slate-500"];
          const colorClass = colors[index % colors.length];
          const dotColor = dotColors[index % dotColors.length];
          return (
            <div key={company} className={`cpill hover:opacity-90 flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${colorClass}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
              <span>{company}</span>
            </div>
          );
        })}
      </div>

      <div className="live-wrap ml-auto flex items-center gap-4 shrink-0 font-sans">
        <div className="live-badge flex items-center gap-1.5 bg-[#ecfdf5] border border-[#6ee7b7] text-[#065f46] text-xs font-semibold px-2.5 py-1 rounded-full">
          <div className="live-dot w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></div>
          <span>Monitoring live</span>
        </div>
        <span className="crawl-meta text-xs text-slate-400 font-semibold hidden md:inline">
          {Object.values(state.data).reduce((acc: number, c: any) => acc + (c.reviewCount || 0), 0).toLocaleString()} reviews
        </span>
        
        <button
          onClick={onOpenSources}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-slate-700 text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          title="Show audit trail & raw crawled reviewer samples"
        >
          <Database className="w-3.5 h-3.5 text-[#0b57d0]" />
          <span className="hidden md:inline">View Sources</span>
        </button>

        <button onClick={onGeneratePDF} className="export-btn bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0">
          ↓ Export brief
        </button>
        <button
          onClick={onToggleChatPane}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-extrabold transition-all cursor-pointer ${
            isChatPaneOpen 
              ? "bg-slate-900 border-slate-900 text-white hover:bg-slate-800" 
              : "bg-white border-gray-300 text-slate-700 hover:bg-gray-50 shadow-xs"
          }`}
          title="Toggle Assistant Panel"
        >
          <Bot className="w-3.5 h-3.5 text-blue-600" />
          <span className="hidden sm:inline">{isChatPaneOpen ? "Hide Chat" : "Ask Agent"}</span>
        </button>
      </div>
    </header>
  );
};
