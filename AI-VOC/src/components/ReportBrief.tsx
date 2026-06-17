import React from "react";
import { ChevronRight } from "lucide-react";
import { AppState, CompanyData, ReportReview, ReportSourcesStatus } from "../types";

interface ReportBriefProps {
  state: AppState;
  openDrawers: { [id: string]: boolean };
  toggleDrawer: (id: string) => void;
  executeChatCommand: (val: string) => void;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  handleChatSubmit: (e: React.FormEvent) => void;
  reportReviews: ReportReview[];
  reportSourcesStatus: ReportSourcesStatus | null;
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  text.replace(pattern, (match, _group, offset) => {
    if (offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset));
    }
    if (match.startsWith("**")) {
      nodes.push(
        <strong key={`${offset}-strong`} className="font-semibold text-slate-900">
          {match.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <em key={`${offset}-em`} className="italic text-[#0b57d0] font-semibold">
          {match.slice(1, -1)}
        </em>
      );
    }
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

export const ReportBrief: React.FC<ReportBriefProps> = ({
  state,
  openDrawers,
  toggleDrawer,
  executeChatCommand,
  chatInput,
  setChatInput,
  handleChatSubmit,
  reportReviews,
  reportSourcesStatus,
}) => {
  const sourceLabels = reportSourcesStatus?.sources?.length ? reportSourcesStatus.sources.join(", ") : "No sources loaded";
  const formatDate = (unix: number | null) =>
    unix ? new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "Undated";
  const latestCrawlLabel = reportSourcesStatus?.latestPublishedAt ? formatDate(reportSourcesStatus.latestPublishedAt) : "Unknown";
  const briefMarkdown =
    state.briefMarkdown ||
    `# ${state.companies[0] || state.query} is tracking at ${(state.data[state.companies[0]]?.rating || 0).toFixed(1)}★\n\n{{block:evidence_kpis}}`;
  const markdownLines = briefMarkdown.split("\n");
  const reportBlockIds = new Set((state.reportBlocks || []).map((block) => block.id));

  const getNegativeSamples = (company: string) =>
    reportReviews
      .filter(
        (review) =>
          review.app.toLowerCase() === company.toLowerCase() &&
          (review.sentiment === "negative" || (typeof review.rating === "number" && review.rating <= 2))
      )
      .slice(0, 3);

  const renderEvidenceDrawers = () => (
    <div>
      {state.companies.map((company) => {
        const isOpen = openDrawers[`ev-ratings-${company}`];
        if (!isOpen) return null;
        return (
          <div key={`ratings-ev-${company}`} className="evidence bg-slate-50 border border-gray-200 rounded-xl p-4.5 my-4 border-l-4 border-l-blue-600 animate-slide-down">
            <div className="ev-head flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 flex-row">
                <span className="text-sm">📊</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{company} Rating Benchmarks</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">Live ratings dataset</span>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
                <span className="text-xs font-bold text-slate-700 truncate font-sans">Average Rating</span>
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(state.data[company]?.rating || 0) * 20}%` }} />
                </div>
                <span className="text-xs font-extrabold text-slate-800 text-right">{(state.data[company]?.rating || 0).toFixed(1)}★</span>
              </div>
            </div>
          </div>
        );
      })}

      {state.companies.map((company) => {
        const isOpen = openDrawers[`ev-share-${company}`];
        if (!isOpen) return null;
        const negativeSamples = getNegativeSamples(company);
        return (
          <div key={`reviews-ev-${company}`} className="evidence bg-slate-50 border border-gray-200 rounded-xl p-4.5 my-4 border-l-4 border-l-blue-600 animate-slide-down">
            <div className="ev-head flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-1.5 flex-row">
                <span className="text-sm">📋</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{company} Verified Customer Scrapes</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">Report evidence</span>
            </div>
            <div className="space-y-2.5">
              {negativeSamples.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No negative review samples matched the active report filters.</div>
              ) : (
                negativeSamples.map((log, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl space-y-1.5 shadow-xs">
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span className="text-amber-500">{typeof log.rating === "number" ? "★".repeat(log.rating) : "No rating"}</span>
                      <span>{formatDate(log.published_at)}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-blue-600">{log.source}</div>
                    <p className="text-xs text-slate-700 italic font-serif leading-relaxed">"{log.content}"</p>
                    {log.source_url && (
                      <a href={log.source_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-600 hover:text-blue-700">
                        Open source
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}

      {state.companies.map((company) => {
        const isOpen = openDrawers[`ev-trend-${company}`];
        if (!isOpen) return null;
        const cData = state.data[company];
        if (!cData || !cData.trendData) return null;
        const points = cData.trendData.map((v, i) => `${(i / (cData.trendData.length - 1)) * 500},${120 - v * 1.5}`).join(" ");
        return (
          <div key={`trend-ev-${company}`} className="evidence bg-slate-50 border border-gray-200 rounded-xl p-4.5 my-4 border-l-4 border-l-blue-600 animate-slide-down">
            <div className="ev-head flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 flex-row font-sans">
                <span className="text-sm">📈</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{company} Negativity Trend (30d)</span>
              </div>
            </div>
            <div className="h-28 w-full mt-2">
              <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                <polyline fill="none" stroke="#ef4444" strokeWidth="2.5" points={points} />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case "evidence_kpis":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" key={blockId}>
            <div className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Evidence</div>
              <div className="mt-1 text-sm font-bold text-slate-800">{(reportSourcesStatus?.totalReviews || 0).toLocaleString()} reviews</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sources</div>
              <div className="mt-1 text-sm font-bold text-slate-800">{reportSourcesStatus?.sourceCount || 0} pools</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Latest Review</div>
              <div className="mt-1 text-sm font-bold text-slate-800">{latestCrawlLabel}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Apps Covered</div>
              <div className="mt-1 text-sm font-bold text-slate-800">{reportSourcesStatus?.appsCovered || state.companies.length}</div>
            </div>
          </div>
        );
      case "situation_overview":
        return (
          <div key={blockId}>
            {state.companies.map((company) => {
              const cData = state.data[company];
              if (!cData) return null;
              const ratingVal = cData.rating || 0.0;
              return (
                <p key={company} className="para text-base text-slate-800 leading-relaxed mb-4">
                  {company} holds a verified store rating of{" "}
                  <span
                    className={`claim border-b-2 border-dotted border-blue-300 hover:bg-blue-50 text-blue-700 font-semibold cursor-pointer pb-0.5 rounded px-1 transition ${openDrawers[`ev-ratings-${company}`] ? "bg-blue-50" : ""}`}
                    onClick={() => toggleDrawer(`ev-ratings-${company}`)}
                  >
                    {ratingVal.toFixed(1)}★, based on {cData.reviewCount.toLocaleString()} reviews<span className="claim-mark ml-1 inline-block text-[9px]">▾</span>
                  </span>
                  . Analysis shows that fully{" "}
                  <span
                    className={`claim border-b-2 border-dotted border-blue-300 hover:bg-blue-50 text-blue-700 font-semibold cursor-pointer pb-0.5 rounded px-1 transition ${openDrawers[`ev-share-${company}`] ? "bg-blue-50" : ""}`}
                    onClick={() => toggleDrawer(`ev-share-${company}`)}
                  >
                    {cData.sentimentBreakdown.neg}% of customer reviews<span className="claim-mark ml-1 inline-block text-[9px]">▾</span>
                  </span>{" "}
                  reflect critical negative sentiment, which continues to{" "}
                  <span
                    className={`claim border-b-2 border-dotted border-blue-300 hover:bg-blue-50 text-blue-700 font-semibold cursor-pointer pb-0.5 rounded px-1 transition ${openDrawers[`ev-trend-${company}`] ? "bg-blue-50" : ""}`}
                    onClick={() => toggleDrawer(`ev-trend-${company}`)}
                  >
                    deviate dynamically across the analyzed timeframe<span className="claim-mark ml-1 inline-block text-[9px]">▾</span>
                  </span>
                  .
                </p>
              );
            })}
            {renderEvidenceDrawers()}
          </div>
        );
      case "topic_bar":
        if (!state.activeBlocks.includes("topic_bar")) return null;
        return (
          <div className="border border-gray-200 rounded-xl p-5 bg-slate-50/50 space-y-4" key={blockId}>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Topic Share Allocation</span>
            <div className="space-y-3.5">
              {state.companies.map((company) => {
                const cData = state.data[company];
                if (!cData || !cData.topicCounts) return null;
                const topics = Object.keys(cData.topicCounts);
                const totalSum = (Object.values(cData.topicCounts) as number[]).reduce((a, b) => a + b, 0) || 1;
                return (
                  <div key={company} className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 font-sans">{company} Category Splits</span>
                    <div className="space-y-2.5">
                      {topics.map((topic, offset) => {
                        const count = cData.topicCounts[topic] || 0;
                        const pct = Math.round((count / totalSum) * 100);
                        const fills = ["bg-blue-600", "bg-slate-600", "bg-emerald-600", "bg-rose-500"];
                        return (
                          <div key={topic} className="space-y-1">
                            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                              <span className="font-sans">{topic}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full ${fills[offset % fills.length]} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case "sentiment_split":
        if (!state.activeBlocks.includes("sentiment_pie")) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" key={blockId}>
            {state.companies.map((company) => {
              const cData = state.data[company];
              if (!cData) return null;
              const { pos, neu, neg } = cData.sentimentBreakdown;
              return (
                <div key={company} className="p-4 bg-slate-50 border border-gray-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-700 block font-sans">{company} Sat. Index</span>
                  <div className="flex gap-1.5 text-center text-[10px] font-bold font-mono">
                    <div className="flex-1 bg-white border border-gray-200 p-2 rounded">
                      <span className="block text-emerald-600">{pos}%</span>
                      <span className="text-gray-400 font-sans text-[8.5px]">POS</span>
                    </div>
                    <div className="flex-1 bg-white border border-gray-200 p-2 rounded">
                      <span className="block text-amber-500">{neu}%</span>
                      <span className="text-gray-400 font-sans text-[8.5px]">NEU</span>
                    </div>
                    <div className="flex-1 bg-white border border-gray-200 p-2 rounded">
                      <span className="block text-red-500">{neg}%</span>
                      <span className="text-gray-400 font-sans text-[8.5px]">NEG</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      case "actions":
        if (!state.activeBlocks.includes("actions")) return null;
        return (
          <div className="rec-block p-6 bg-linear-to-br from-[#f0f6ff]/60 to-[#f5f3ff]/40 border border-[#d4e2fb] rounded-2xl" key={blockId}>
            <div className="rec-title font-serif text-2xl font-bold text-slate-900 mb-1">What we'd do</div>
            <div className="rec-sub text-xs text-slate-500 mb-5">Tactical action prescriptions compiled from store feedback:</div>
            <div className="space-y-4">
              {state.companies.map((comp) => {
                const cData = state.data[comp];
                if (!cData || !cData.actions) return null;
                return (
                  <div key={comp} className="space-y-3">
                    <span className="text-[10px] font-bold text-blue-900 uppercase tracking-widest block font-sans">{comp} Recommendations:</span>
                    <div className="space-y-3 divide-y divide-blue-150">
                      {cData.actions.PO[0] && (
                        <div className="flex gap-4 pt-3 first:pt-0">
                          <div className="rec-num w-6 h-6 shrink-0 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">1</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="rec-item-title text-xs font-bold text-slate-800 font-sans">Operational Backup Failover</span>
                              <span className="rec-tag tag-now text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">Do now</span>
                            </div>
                            <p className="rec-item-text text-xs text-slate-600 leading-relaxed">{cData.actions.PO[0]}</p>
                          </div>
                        </div>
                      )}
                      {cData.actions.QA[0] && (
                        <div className="flex gap-4 pt-3">
                          <div className="rec-num w-6 h-6 shrink-0 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">2</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="rec-item-title text-xs font-bold text-slate-800 font-sans">Quality &amp; Network Diagnostics</span>
                              <span className="rec-tag tag-soon text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">This quarter</span>
                            </div>
                            <p className="rec-item-text text-xs text-slate-600 leading-relaxed">{cData.actions.QA[0]}</p>
                          </div>
                        </div>
                      )}
                      {cData.actions.Marketing[0] && (
                        <div className="flex gap-4 pt-3">
                          <div className="rec-num w-6 h-6 shrink-0 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">3</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="rec-item-title text-xs font-bold text-slate-800 font-sans">Customer Support Campaigns</span>
                              <span className="rec-tag tag-ongoing text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-sans">Ongoing</span>
                            </div>
                            <p className="rec-item-text text-xs text-slate-600 leading-relaxed">{cData.actions.Marketing[0]}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case "next_threads": {
        const block = state.reportBlocks?.find((item) => item.id === "next_threads" && item.type === "next_threads");
        const threads = block?.type === "next_threads" ? block.threads : [];
        return (
          <div className="threads pt-6 border-t border-gray-150" key={blockId}>
            <div className="threads-label font-serif italic text-lg text-slate-800 mb-3.5">Three threads worth pulling next…</div>
            <div className="grid grid-cols-1 gap-2.5 select-none no-print">
              {threads.map((thread, index) => (
                <button
                  key={`${thread.title}-${index}`}
                  className="thread flex items-center gap-3.5 p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-650 hover:shadow-xs transition-colors cursor-pointer text-left w-full h-full"
                  onClick={() => executeChatCommand(thread.prompt)}
                >
                  <div className="thread-icon w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">{thread.icon}</div>
                  <div className="thread-body flex-1">
                    <div className="thread-title text-xs font-bold text-slate-850 font-sans">{thread.title}</div>
                    <div className="thread-note text-[11px] text-slate-400 font-sans">{thread.note}</div>
                  </div>
                  <div className="thread-arrow text-slate-400 text-sm">&#10142;</div>
                </button>
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const renderedMarkdown: React.ReactNode[] = [];
  for (let index = 0; index < markdownLines.length; index += 1) {
    const line = markdownLines[index].trim();
    if (!line) {
      continue;
    }

    const blockMatch = line.match(/^\{\{block:([a-z0-9_-]+)\}\}$/i);
    if (blockMatch) {
      const blockId = blockMatch[1];
      if (reportBlockIds.has(blockId)) {
        renderedMarkdown.push(<React.Fragment key={`block-${blockId}-${index}`}>{renderBlock(blockId)}</React.Fragment>);
      }
      continue;
    }

    if (line.startsWith("# ")) {
      renderedMarkdown.push(
        <h1 key={`h1-${index}`} className="verdict font-serif text-3xl font-medium text-slate-900 leading-tight">
          {renderInlineMarkdown(line.slice(2))}
        </h1>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      renderedMarkdown.push(
        <div key={`h2-${index}`}>
          <div className="sec-label text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{line.slice(3)}</div>
        </div>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items = [line.slice(2)];
      while (index + 1 < markdownLines.length && markdownLines[index + 1].trim().startsWith("- ")) {
        index += 1;
        items.push(markdownLines[index].trim().slice(2));
      }
      renderedMarkdown.push(
        <ul key={`ul-${index}`} className="space-y-2 text-base text-slate-800 leading-relaxed list-disc pl-5">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    renderedMarkdown.push(
      <p key={`p-${index}`} className="para text-base text-slate-800 leading-relaxed">
        {renderInlineMarkdown(line)}
      </p>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f5f7] relative min-w-0">
      <div className="flex-1 overflow-y-auto w-full flex flex-col items-center px-4 pt-6">
        <div className="brief w-full max-w-[760px] bg-white mb-7 p-8 md:p-14 border border-gray-200 rounded-2xl shadow-md space-y-8 select-text">
          <div className="brief-eyebrow flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-widest">
            <span>Intelligence Brief · {state.filters.dateRange === "30d" ? "30-day window" : state.filters.dateRange === "7d" ? "7-day window" : "90-day window"}</span>
            <div className="flex-1 h-[1px] bg-gray-200"></div>
          </div>

          <div className="deck text-xs text-slate-500 pb-5 border-b-2 border-slate-900 flex items-center gap-2 flex-wrap">
            <span className="author font-bold text-slate-800 flex items-center gap-1">
              <span className="author-mark w-4.5 h-4.5 rounded-full bg-[#0b57d0] text-white flex items-center justify-center text-[10px]">✦</span>
              <span>Synthesised by Research Agent</span>
            </span>
            <span>·</span>
            <span>from {((Object.values(state.data) as CompanyData[])).reduce((acc: number, c: CompanyData) => acc + (c.reviewCount || 0), 0).toLocaleString()} reviews across {state.companies.length} apps</span>
            <span>·</span>
            <span>{sourceLabels}</span>
          </div>

          {renderedMarkdown}

          {state.customBlocks && state.customBlocks.length > 0 && (
            <div className="space-y-4 pt-6 border-t border-gray-150">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Custom Analyst Modules</div>
              {state.customBlocks.map((block) => (
                <div key={block.id} className="p-5 bg-white border border-gray-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-xs font-bold text-blue-650 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider text-[9px] font-sans">Custom AI</span>
                    <span className="text-xs font-bold text-slate-800">{block.title}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {state.companies.map((comp) => {
                      const bData = block.data[comp];
                      if (!bData) return null;
                      return (
                        <div key={comp} className="p-3.5 bg-gray-50 rounded-xl border border-gray-150 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-xs font-bold text-slate-705 font-sans">{comp}</span>
                            <span className="text-xs font-bold text-amber-500">{bData.rating?.toFixed(1) || "N/A"}★</span>
                          </div>
                          <p className="text-[11px] text-slate-600 italic leading-relaxed">"{bData.summary}"</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 bg-[#f4f5f7] border-t border-gray-200/60 pt-3 pb-5 px-4 no-print flex flex-col items-center shadow-xs">
        <div className="w-full max-w-[760px]">
          <div className="cmd-inner flex items-center gap-3 bg-white border-2 border-gray-200 focus-within:border-blue-500 rounded-xl p-2.5 pl-4 shadow-sm">
            <span className="cmd-glyph text-xs text-slate-400 font-semibold">✦</span>
            <input
              className="cmd-input flex-1 bg-transparent outline-none text-xs text-slate-805 placeholder-gray-400 font-sans"
              placeholder="Interrogate a claim or pull your own thread — e.g. 'Is MoMo losing Viettel users?'"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleChatSubmit(e);
                }
              }}
            />
            <button onClick={handleChatSubmit} disabled={!chatInput.trim()} className="cmd-send w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center justify-center cursor-pointer transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="cmd-hint text-center text-[10px] text-slate-400 mt-2 uppercase font-semibold font-sans">Every claim above is clickable · answers append or trigger the agent chat</div>
        </div>
      </div>
    </div>
  );
};
