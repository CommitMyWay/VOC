import React from "react";
import { Plus, X, Check } from "lucide-react";
import { AppState, BlockId } from "../types";

interface ReportSidebarProps {
  state: AppState;
  onReset: () => void;
  onRemoveCompany: (company: string) => void;
  onToggleBlock: (id: BlockId) => void;
  allBlockInfos: { id: BlockId; name: string; description: string }[];
}

export const ReportSidebar: React.FC<ReportSidebarProps> = ({
  state,
  onReset,
  onRemoveCompany,
  onToggleBlock,
  allBlockInfos
}) => {
  return (
    <aside className="w-full md:w-60 bg-white border-r border-gray-200 flex flex-col h-full shrink-0 no-print font-sans">
      
      {/* New Search / Reset */}
      <div className="p-5 pb-3">
        <button
          id="new_search_btn"
          onClick={onReset}
          className="w-full py-2.5 px-4 rounded-lg bg-white border border-gray-300 text-slate-700 hover:bg-gray-50 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-slate-500" /> New Analysis
        </button>
      </div>

      <div className="flex-1 px-4 py-2 space-y-6 overflow-y-auto">
        
        {/* Active Companies List */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2.5">
            Tracked Apps
          </h3>
          {state.companies.length === 0 ? (
            <div className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-lg">No active apps.</div>
          ) : (
            <ul className="space-y-1">
              {state.companies.map((company, index) => {
                const colors = [
                  "bg-[#b71c5a]", // momo pink
                  "bg-[#1565c0]", // zalopay blue
                  "bg-[#c62828]", // vnpay red
                  "bg-slate-500"
                ];
                const colorDot = colors[index % colors.length];
                return (
                  <li
                    key={company}
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-150 transition-all hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${colorDot} shrink-0`}></div>
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">{company}</span>
                    </div>
                    {state.companies.length > 1 && (
                      <button
                        id={`remove_comp_${company}`}
                        onClick={() => onRemoveCompany(company)}
                        className="text-gray-400 hover:text-red-500 p-0.5 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
                        title={`Remove ${company}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Report Sections Block Toggles */}
        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-2.5">Report Sections</h3>
          <ul className="space-y-0.5">
            {allBlockInfos.map((block) => {
              const isActive = state.activeBlocks.includes(block.id);
              return (
                <li key={block.id}>
                  <button
                    id={`toggle_block_${block.id}`}
                    onClick={() => onToggleBlock(block.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-md text-xs transition-all pointer-events-auto cursor-pointer ${
                      isActive 
                        ? "text-slate-900 font-bold bg-slate-50" 
                        : "text-slate-500 hover:text-slate-800 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                      isActive ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white"
                    }`}>
                      {isActive && <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />}
                    </div>
                    <span className="truncate">{block.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

      </div>

      {/* Sync Status Badge Panel */}
      <div className="p-4 border-t border-gray-200 bg-gray-50/50">
        <div className="text-[11px] text-slate-500 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-row">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-slate-650">Synthesis Live Sync</span>
          </div>
          <div className="space-y-1 bg-white p-2 rounded-md border border-gray-200 text-[9px] text-slate-550">
            <div className="flex justify-between"><span className="text-gray-400">WINDOW</span><span className="font-bold text-slate-700 uppercase">{state.filters.dateRange}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">RATING</span><span className="font-bold text-slate-700 uppercase">{state.filters.sentiment}</span></div>
          </div>
        </div>
      </div>

    </aside>
  );
};
