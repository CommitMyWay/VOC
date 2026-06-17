import React, { useState, useEffect, useRef } from "react";
import {
  Search, 
  Sparkles, 
  Trash2, 
  X, 
  Plus, 
  RefreshCw, 
  TrendingDown, 
  ArrowUp, 
  User, 
  Bot, 
  ChevronRight, 
  CheckCircle,
  FileText,
  AlertCircle,
  BarChart3,
  Percent,
  TrendingUp,
  SlidersHorizontal,
  Info,
  BookOpen,
  PlusCircle,
  MessageSquare,
  HelpCircle,
  Database,
  Check,
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import {
  AppState,
  BlockId,
  CompanyData,
  ChatMessage,
  AppFilters,
  CustomBlock,
  SetupState,
  ClarifyStep,
  ResolvedApp,
  UnderstandIntent,
  ReportStatus,
  ReportReview,
  ReportReference,
  ReportSourcesStatus,
  ReportBlock,
} from "./types";
import { ReportBrief } from "./components/ReportBrief";
import { ReportHeader } from "./components/ReportHeader";
import { ReportChatPane } from "./components/ReportChatPane";

const SUGGESTIONS = [
  "Analyse MoMo for product insights",
  "Compare ZaloPay customer reviews",
  "Benchmark VNPay features",
  "Add ShopeePay to compare"
];

const DEFAULT_BLOCKS: BlockId[] = ["metrics", "insights", "sentiment_pie", "topic_bar", "trend", "actions"];

const ALL_BLOCK_INFOS: { id: BlockId; name: string; description: string }[] = [
  { id: "metrics", name: "Overview Metrics", description: "Average ratings and review metrics" },
  { id: "insights", name: "Topic Pain Points", description: "Top complaints list with serverity badge" },
  { id: "sentiment_pie", name: "Sentiment Breakdown", description: "Positive / Neutral / Negative donut split" },
  { id: "topic_bar", name: "Topic Complaints", description: "Horizontal topic breakdown bar chart" },
  { id: "trend", name: "Negative Trend", description: "Last 30 days negative sentiment trend line" },
  { id: "actions", name: "Action Proposals", description: "PO / QA / Marketing tactical actions list" }
];

const DEFAULT_SETUP_STATE: SetupState = {
  sessionId: null,
  currentStep: 0,
  reason: null,
  steps: [],
  answers: {},
  intent: null,
  apps: [],
  summary: "",
};

const TIME_RANGE_LABELS: Record<string, string> = {
  last_7_days: "7d",
  last_30_days: "30d",
  last_90_days: "90d",
};

const SOURCE_LABELS: Record<string, string> = {
  app_store: "App Store",
  google_play: "Google Play",
  youtube: "YouTube",
  tinhte: "Tinhte",
  voz: "Voz",
  reddit: "Reddit",
};

const REPORT_SOURCE_LABELS: Record<string, string> = {
  app_store: "App Store",
  google_play: "Google Play",
  youtube: "YouTube",
  tinhte: "Tinhte",
  voz: "VOZ",
  reddit: "Reddit",
};

function formatReportSource(source: string) {
  return REPORT_SOURCE_LABELS[source] || source.replace(/_/g, " ");
}

function formatPublishedDate(unix: number | null) {
  if (!unix) {
    return "Undated";
  }
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function deriveReportSourcesStatus(reviews: ReportReview[], companies: string[]): ReportSourcesStatus {
  const sourceSet = new Set(reviews.map((review) => formatReportSource(review.source)));
  const latestPublishedAt = reviews.reduce<number | null>((latest, review) => {
    if (!review.published_at) {
      return latest;
    }
    if (!latest || review.published_at > latest) {
      return review.published_at;
    }
    return latest;
  }, null);

  return {
    totalReviews: reviews.length,
    sourceCount: sourceSet.size,
    sources: Array.from(sourceSet),
    latestPublishedAt,
    appsCovered: new Set(reviews.map((review) => review.app).filter(Boolean)).size || companies.length,
  };
}

export default function App() {
  // State Initialization from LocalStorage
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem("market_research_agent_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate keys exist
        if (parsed.phase && parsed.companies && parsed.activeBlocks) {
          return parsed;
        }
      } catch (err) {
        console.error("Error standardizing local storage state:", err);
      }
    }
    return {
      phase: "search",
      query: "",
      companies: [],
      activeBlocks: DEFAULT_BLOCKS,
      filters: {
        sentiment: "all",
        dateRange: "30d",
        sources: ["Google Play", "App Store"]
      },
      data: {},
      chatHistory: [],
      customBlocks: [],
      setup: DEFAULT_SETUP_STATE,
      reportId: null,
      reportStatus: undefined,
      market: null,
      reportReviews: [],
      reportReferences: [],
      reportSourcesStatus: null,
      isLoadingSources: false,
      briefMarkdown: "",
      reportBlocks: [],
    };
  });

  // UI state variables
  const [searchInput, setSearchInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Starting analysis...");
  const [isChatPaneOpen, setIsChatPaneOpen] = useState(true);
  const [openDrawers, setOpenDrawers] = useState<{ [id: string]: boolean }>({});

  const toggleDrawer = (id: string) => {
    setOpenDrawers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // New Custom Block state hooks
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [customBlockTitle, setCustomBlockTitle] = useState("");
  const [customBlockPrompt, setCustomBlockPrompt] = useState("");
  const [isGeneratingBlock, setIsGeneratingBlock] = useState(false);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState(false);

  // Chart interactivity hover hooks
  const [hoveredSentimentCompany, setHoveredSentimentCompany] = useState<string | null>(null);
  const [hoveredSentimentSegment, setHoveredSentimentSegment] = useState<"pos" | "neu" | "neg" | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // Human-in-the-loop confirmation state hooks
  const [isPreparingConfirm, setIsPreparingConfirm] = useState(false);
  const [customStepInput, setCustomStepInput] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomChatRef = useRef<HTMLDivElement>(null);

  const setup = state.setup ?? DEFAULT_SETUP_STATE;

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem("market_research_agent_state", JSON.stringify(state));
  }, [state]);

  const updateSetup = (updater: (prev: SetupState) => SetupState) => {
    setState((prev) => ({
      ...prev,
      setup: updater(prev.setup ?? DEFAULT_SETUP_STATE),
    }));
  };

  const resetSetup = () => {
    setCustomStepInput({});
    updateSetup(() => ({ ...DEFAULT_SETUP_STATE }));
  };

  const currentStep = setup.steps[setup.currentStep] ?? null;

  const getAnswerLabel = (value: string) => {
    return SOURCE_LABELS[value] ?? value.replace(/_/g, " ");
  };

  const currentStepHasAnswer = () => {
    if (!currentStep) {
      return false;
    }
    const value = setup.answers[currentStep.step_id];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "boolean") {
      return true;
    }
    return typeof value === "string" && value.trim().length > 0;
  };

  // Scroll to new chat elements automatically
  useEffect(() => {
    if (state.phase === "report") {
      bottomChatRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [state.chatHistory, state.phase]);

  const fetchReportEvidence = async (reportId: string, companies: string[]) => {
    const params = companies.map((company) => `companies=${encodeURIComponent(company)}`).join("&");
    const querySuffix = params ? `?${params}` : "";
    const [reviewsRes, referencesRes] = await Promise.all([
      fetch(`/api/reports/${reportId}/reviews${querySuffix}`),
      fetch(`/api/reports/${reportId}/references${querySuffix}`),
    ]);

    if (!reviewsRes.ok || !referencesRes.ok) {
      throw new Error("Could not load report evidence.");
    }

    const reviewsBody = await reviewsRes.json();
    const referencesBody = await referencesRes.json();
    const reportReviews = Array.isArray(reviewsBody?.reviews) ? (reviewsBody.reviews as ReportReview[]) : [];
    const reportReferences = Array.isArray(referencesBody?.references) ? (referencesBody.references as ReportReference[]) : [];
    return {
      reportReviews,
      reportReferences,
      reportSourcesStatus: deriveReportSourcesStatus(reportReviews, companies),
    };
  };

  useEffect(() => {
    if (state.phase !== "loading" || !state.reportId) {
      return;
    }

    const evtSource = new EventSource(`/api/reports/${state.reportId}/stream`);

    const fetchReport = async () => {
      const reportRes = await fetch(`/api/reports/${state.reportId}`);
      if (!reportRes.ok) {
        throw new Error("Could not load completed report.");
      }
      const report = await reportRes.json();
      const companies = Object.keys(report.data || {});
      const evidence = await fetchReportEvidence(state.reportId!, companies);
      setState((prev) => ({
        ...prev,
        phase: "report",
        reportStatus: report.status as ReportStatus,
        companies,
        data: report.data || {},
        market: report.market || null,
        reportReviews: evidence.reportReviews,
        reportReferences: evidence.reportReferences,
        reportSourcesStatus: evidence.reportSourcesStatus,
        isLoadingSources: false,
        briefMarkdown: report.brief_markdown || "",
        reportBlocks: Array.isArray(report.blocks) ? (report.blocks as ReportBlock[]) : [],
        chatHistory: [
          {
            id: `sys-${Date.now()}`,
            role: "agent",
            text: `Analysis complete. ${Object.keys(report.data || {}).length} apps analyzed with real review data.`,
            timestamp: Date.now(),
          },
        ],
      }));
    };

    const handleProgress = (event: MessageEvent) => {
      const payload = JSON.parse(event.data);
      setLoadingMessage(payload.message || "Analysis in progress...");
      setState((prev) => ({
        ...prev,
        reportStatus: "running",
      }));
    };

    const handleDone = async () => {
      evtSource.close();
      await fetchReport();
    };

    const handleError = () => {
      evtSource.close();
      setAlertMessage("Crawl failed. Please try again.");
      setState((prev) => ({
        ...prev,
        phase: "confirm",
        reportStatus: "error",
      }));
    };

    evtSource.addEventListener("fetch", handleProgress);
    evtSource.addEventListener("classify", handleProgress);
    evtSource.addEventListener("aggregate", handleProgress);
    evtSource.addEventListener("insight", handleProgress);
    evtSource.addEventListener("done", handleDone);
    evtSource.addEventListener("error", handleError);

    return () => {
      evtSource.close();
    };
  }, [state.phase, state.reportId]);

  // Reset to landing page
  const handleReset = () => {
    setState({
      phase: "search",
      query: "",
      companies: [],
      activeBlocks: DEFAULT_BLOCKS,
      filters: {
        sentiment: "all",
        dateRange: "30d",
        sources: ["Google Play", "App Store"]
      },
      data: {},
      chatHistory: [],
      customBlocks: [],
      setup: DEFAULT_SETUP_STATE,
      reportId: null,
      reportStatus: undefined,
      market: null,
      reportReviews: [],
      reportReferences: [],
      reportSourcesStatus: null,
      isLoadingSources: false,
      briefMarkdown: "",
      reportBlocks: [],
    });
    setSearchInput("");
    setChatInput("");
    setCustomBlockTitle("");
    setCustomBlockPrompt("");
    setIsAddingBlock(false);
    setCustomStepInput({});
    setLoadingMessage("Starting analysis...");
  };

  const handleGeneratePDF = () => {
    window.print();
  };

  const handleCreateCustomBlock = async () => {
    if (!customBlockTitle.trim() || !customBlockPrompt.trim()) return;
    setIsGeneratingBlock(true);
    setAlertMessage(null);

    try {
      const response = await fetch("/api/generate_custom_block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: customBlockTitle,
          prompt: customBlockPrompt,
          companies: state.companies
        })
      });

      if (!response.ok) {
        throw new Error("Unable to synthesize custom block content.");
      }

      const blockRes = await response.json();
      const newCustomBlock: CustomBlock = {
        id: `custom-${Date.now()}`,
        title: blockRes.title || customBlockTitle,
        data: blockRes.data
      };

      setState((prev) => ({
        ...prev,
        customBlocks: [...(prev.customBlocks || []), newCustomBlock]
      }));

      setIsAddingBlock(false);
      setCustomBlockTitle("");
      setCustomBlockPrompt("");
    } catch (err: any) {
      console.error("Custom block synthesis error:", err);
      setAlertMessage(err?.message || "Failed to generate custom report module.");
    } finally {
      setIsGeneratingBlock(false);
    }
  };

  const hydrateSetupFromResponse = (queryText: string, data: any) => {
    if (data?.phase === "clarify") {
      const nextSteps: ClarifyStep[] = Array.isArray(data?.steps) ? data.steps : [];
      const nextAnswers = nextSteps.reduce((acc: SetupState["answers"], step) => {
        const previous = setup.answers[step.step_id];
        if (previous !== undefined) {
          acc[step.step_id] = previous;
          return acc;
        }
        if (step.question.type === "multi_select" && step.question.recommended) {
          acc[step.step_id] = [step.question.recommended];
          return acc;
        }
        if (step.question.recommended) {
          acc[step.step_id] = step.question.recommended;
        }
        return acc;
      }, {});

      setState((prev) => ({
        ...prev,
        phase: "clarify",
        query: queryText,
        setup: {
          ...(prev.setup ?? DEFAULT_SETUP_STATE),
          sessionId: data.session_id ?? prev.setup?.sessionId ?? null,
          currentStep: 0,
          reason: data.reason ?? null,
          steps: nextSteps,
          answers: nextAnswers,
          intent: null,
          apps: [],
          summary: "",
        },
      }));
      return;
    }

    if (data?.phase === "confirm") {
      setState((prev) => ({
        ...prev,
        phase: "confirm",
        query: queryText,
        setup: {
          ...(prev.setup ?? DEFAULT_SETUP_STATE),
          sessionId: data.session_id ?? prev.setup?.sessionId ?? null,
          currentStep: 0,
          reason: null,
          steps: prev.setup?.steps ?? [],
          answers: prev.setup?.answers ?? {},
          intent: data.intent ?? null,
          apps: Array.isArray(data.apps) ? data.apps : [],
          summary: data.summary ?? "",
        },
      }));
      return;
    }

    throw new Error(data?.message || "Unexpected understand response.");
  };

  const requestUnderstand = async (payload: { query?: string; answers?: Record<string, string | string[] | boolean>; session_id?: string | null }) => {
    const res = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("[voc-debug] understand:response", {
      ok: res.ok,
      status: res.status,
      data,
    });

    if (!res.ok) {
      throw new Error(data?.details || data?.message || data?.error || "Could not understand this request.");
    }

    return data;
  };

  const prepareConfirmation = async (queryText: string) => {
    if (!queryText.trim()) return;
    console.log("[voc-debug] understand:start", { queryText });

    setAlertMessage(null);
    setSearchInput(queryText);
    setIsPreparingConfirm(true);
    setState((prev) => ({
      ...prev,
      phase: "clarify",
      query: queryText,
      setup: {
        ...DEFAULT_SETUP_STATE,
      },
    }));

    try {
      const data = await requestUnderstand({ query: queryText });
      hydrateSetupFromResponse(queryText, data);
    } catch (err: any) {
      console.error("[voc-debug] understand:error", err);
      setAlertMessage(err?.message || "Could not load setup questions.");
      setState((prev) => ({ ...prev, phase: "search" }));
      resetSetup();
    } finally {
      setIsPreparingConfirm(false);
    }
  };

  const submitClarification = async () => {
    if (!state.query.trim()) {
      return;
    }

    setAlertMessage(null);
    setIsPreparingConfirm(true);

    try {
      const data = await requestUnderstand({
        query: state.query,
        answers: setup.answers,
        session_id: setup.sessionId,
      });
      hydrateSetupFromResponse(state.query, data);
    } catch (err: any) {
      console.error("[voc-debug] clarify:error", err);
      setAlertMessage(err?.message || "Could not continue setup.");
    } finally {
      setIsPreparingConfirm(false);
    }
  };

  // Run full analysis on a query utilizing human-confirmed parameters
  const runAnalysis = async () => {
    const intent = setup.intent as UnderstandIntent | null;
    const selectedApps = setup.apps as ResolvedApp[];
    if (!intent || selectedApps.length === 0) {
      setAlertMessage("Please keep at least one verified app before starting analysis.");
      return;
    }

    const sourceLabels = (intent.data_sources.length > 0 ? intent.data_sources : ["app_store", "google_play"]).map((source) => getAnswerLabel(source));
    const dateRange = TIME_RANGE_LABELS[intent.filters.time_range] ?? "90d";
    const answersText = Object.entries(setup.answers)
      .map(([stepId, answer]) => {
        const step = setup.steps.find((item) => item.step_id === stepId);
        const formatted = Array.isArray(answer) ? answer.join(", ") : String(answer);
        return step ? `${step.question.question}: "${formatted}"` : formatted;
      })
      .join(". ");

    const compositeFocus = `Target Product: ${intent.subject}. Focus: ${intent.focus}. Objective: ${intent.objective}. Audience: ${intent.audience}. Data Sources: ${sourceLabels.join(", ")}. Time Range: ${intent.filters.time_range}. ${answersText}`.trim();

    setState((prev) => ({
      ...prev,
      phase: "loading",
      reportId: null,
      reportStatus: "pending",
      reportReviews: [],
      reportReferences: [],
      reportSourcesStatus: null,
      isLoadingSources: true,
      briefMarkdown: "",
      reportBlocks: [],
    }));
    setLoadingMessage("Starting analysis...");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed_apps: selectedApps,
          intent: {
            ...intent,
            focus: compositeFocus,
          },
        })
      });

      if (!response.ok) {
        throw new Error("Analysis failed. Please verify your connection.");
      }
      const result = await response.json();

      setState((prev) => ({
        ...prev,
        query: intent.subject,
        filters: {
          ...prev.filters,
          dateRange: dateRange as AppFilters["dateRange"],
          sources: sourceLabels,
        },
        reportId: result.report_id,
      }));
    } catch (err: any) {
      console.error(err);
      setAlertMessage(err.message || "Could not complete parsing request. Please retry.");
      setState((prev) => ({ ...prev, phase: "confirm" }));
    }
  };

  // Submit search bar and launch progress
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    prepareConfirmation(searchInput);
  };

  // Trigger suggestion chip
  const handleChipClick = (suggestion: string) => {
    setSearchInput(suggestion);
    prepareConfirmation(suggestion);
  };

  const setStepAnswer = (stepId: string, value: string | string[] | boolean) => {
    updateSetup((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [stepId]: value,
      },
    }));
  };

  const toggleMultiSelectChoice = (stepId: string, choice: string) => {
    const current = setup.answers[stepId];
    const next = Array.isArray(current) ? [...current] : [];
    const index = next.indexOf(choice);
    if (index >= 0) {
      next.splice(index, 1);
    } else {
      next.push(choice);
    }
    setStepAnswer(stepId, next);
  };

  const addCustomChoiceToStep = (stepId: string) => {
    const value = customStepInput[stepId]?.trim();
    if (!value) {
      return;
    }

    if (currentStep?.question.type === "multi_select") {
      const existing = setup.answers[stepId];
      const next = Array.isArray(existing) ? existing : [];
      if (!next.includes(value)) {
        setStepAnswer(stepId, [...next, value]);
      }
    } else {
      setStepAnswer(stepId, value);
    }

    setCustomStepInput((prev) => ({ ...prev, [stepId]: "" }));
  };

  const handleWizardContinue = async () => {
    if (state.phase === "clarify") {
      if (setup.currentStep < setup.steps.length - 1) {
        updateSetup((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }));
        return;
      }
      await submitClarification();
      return;
    }

    if (state.phase === "confirm") {
      runAnalysis();
    }
  };

  const handleWizardBack = () => {
    if (state.phase === "clarify" && setup.currentStep > 0) {
      updateSetup((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }));
      return;
    }
    setState((prev) => ({ ...prev, phase: "search" }));
  };

  const removeResolvedApp = (name: string) => {
    updateSetup((prev) => ({
      ...prev,
      apps: prev.apps.filter((app) => app.name !== name),
    }));
  };

  const handleToggleBlock = (blockId: BlockId) => {
    setState((prev) => {
      const activeBlocks = prev.activeBlocks.includes(blockId)
        ? prev.activeBlocks.filter((id) => id !== blockId)
        : [...prev.activeBlocks, blockId];
      return { ...prev, activeBlocks };
    });
  };

  const handleRemoveCompany = (companyName: string) => {
    setState((prev) => {
      const companies = prev.companies.filter((c) => c !== companyName);
      // Clean data map
      const data = { ...prev.data };
      delete data[companyName];
      return { ...prev, companies, data };
    });
  };

  const looksLikeMutationCommand = (message: string) => {
    const normalized = message.toLowerCase();
    return [
      "add ",
      "remove ",
      "hide ",
      "show ",
      "compare",
      "chart",
      "block",
      "filter",
      "toggle",
      "include ",
    ].some((phrase) => normalized.includes(phrase));
  };

  const runGroundedChat = async (userMsg: string) => {
    if (!state.reportId) {
      throw new Error("No active report to answer from.");
    }

    const response = await fetch(`/api/reports/${state.reportId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg,
        companies: state.companies,
      }),
    });

    if (!response.ok) {
      throw new Error("Grounded chat could not answer from report evidence.");
    }

    const result = await response.json();
    setState((prev) => ({
      ...prev,
      chatHistory: [
        ...prev.chatHistory,
        {
          id: `agent-grounded-${Date.now()}`,
          role: "agent",
          text: result.answer || "I could not find enough evidence in the current report to answer confidently.",
          timestamp: Date.now(),
          citations: Array.isArray(result.citations) ? result.citations : [],
        },
      ],
    }));
  };

  const runMutationChat = async (userMsg: string) => {
    let summaryText = "";
    Object.keys(state.data).forEach((c) => {
      const info = state.data[c];
      summaryText += `${c} rating ${info.rating}, total reviews: ${info.reviewCount}. Topics: ${JSON.stringify(info.topicCounts)}. Top insights: ${info.insights.map((i) => i.text).join("; ")}.\n`;
    });

    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg,
        companies: state.companies,
        filters: state.filters,
        summaryText,
      }),
    });

    if (!response.ok) {
      throw new Error("Chat service had an issue processing.");
    }

    const { actions, updatedData, updatedReports } = await response.json();

    const generatedCustomBlocks: CustomBlock[] = [];
    for (const act of actions) {
      if (act.type === "ADD_CUSTOM_BLOCK" && act.payload?.custom_block_title) {
        try {
          const title = act.payload.custom_block_title;
          const promptStr = act.payload.custom_block_prompt || `Analyze ${title}`;
          const addedCompany = actions.find((a: any) => a.type === "ADD_COMPANY")?.payload?.company_name;
          const targetCompanies = Array.from(new Set([...state.companies, addedCompany].filter(Boolean))) as string[];

          const customRes = await fetch("/api/generate_custom_block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              prompt: promptStr,
              companies: targetCompanies.length > 0 ? targetCompanies : state.companies,
            }),
          });

          if (customRes.ok) {
            const blockRes = await customRes.json();
            generatedCustomBlocks.push({
              id: `custom-${Date.now()}-${Math.random()}`,
              title: blockRes.title || title,
              data: blockRes.data,
            });
          }
        } catch (e) {
          console.error("Failed custom block pre-fetch:", e);
        }
      }
    }

    const companiesNeedingEvidence = new Set<string>();
    setState((prev) => {
      let newCompanies = [...prev.companies];
      let newActiveBlocks = [...prev.activeBlocks];
      let newFilters = { ...prev.filters };
      let newData = { ...prev.data, ...updatedData };
      let newChatHistory = [...prev.chatHistory];
      let newCustomBlocks = [...(prev.customBlocks || [])];

      if (generatedCustomBlocks.length > 0) {
        newCustomBlocks = [...newCustomBlocks, ...generatedCustomBlocks];
      }

      actions.forEach((act: any) => {
        switch (act.type) {
          case "ASK":
            if (act.payload?.answer) {
              newChatHistory.push({
                id: `agent-ask-${Date.now()}-${Math.random()}`,
                role: "agent",
                text: act.payload.answer,
                timestamp: Date.now(),
                citations: act.payload.citations,
              });
            }
            break;
          case "ADD_CUSTOM_BLOCK":
            if (act.payload?.custom_block_title) {
              newChatHistory.push({
                id: `agent-custom-${Date.now()}`,
                role: "agent",
                text: `I've synthesized and custom-pinned a new KPI card: **"${act.payload.custom_block_title}"** directly onto your dashboard, customized with comparative benchmarks.`,
                timestamp: Date.now(),
              });
            }
            break;
          case "ADD_BLOCK": {
            const bId = act.payload?.block_id as BlockId;
            if (bId && !newActiveBlocks.includes(bId)) {
              newActiveBlocks.push(bId);
            }
            break;
          }
          case "REMOVE_BLOCK": {
            const bId = act.payload?.block_id as BlockId;
            if (bId) {
              newActiveBlocks = newActiveBlocks.filter((id) => id !== bId);
            }
            break;
          }
          case "ADD_COMPANY": {
            const cName = act.payload?.company_name;
            if (cName && !newCompanies.includes(cName)) {
              newCompanies.push(cName);
              companiesNeedingEvidence.add(cName);
              newChatHistory.push({
                id: `agent-add-company-${Date.now()}`,
                role: "agent",
                text: `I have successfully analyzed brand **"${cName}"**, scraped its active app stores reviews, and added it to the comparison array.`,
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "REMOVE_COMPANY": {
            const cName = act.payload?.company_name;
            if (cName) {
              newCompanies = newCompanies.filter((name) => name !== cName);
              delete newData[cName];
            }
            break;
          }
          case "FILTER": {
            const key = act.payload?.filter_key;
            const val = act.payload?.filter_value;
            if (key === "sentiment" || key === "dateRange") {
              newFilters[key] = val as any;
            }
            break;
          }
          default:
            break;
        }
      });

      const hasInteractiveMsg = actions.some((a: any) => a.type === "ASK" || a.type === "ADD_CUSTOM_BLOCK" || a.type === "ADD_COMPANY");
      if (!hasInteractiveMsg) {
        const actionTypes = actions.map((a: any) => a.type).join(", ");
        newChatHistory.push({
          id: `agent-act-${Date.now()}`,
          role: "agent",
          text: `I've updated the dashboard canvas based on your request (Actions: **${actionTypes || "None"}**).`,
          timestamp: Date.now(),
        });
      }

      const nextReportReviews = prev.reportReviews?.filter((review) => newCompanies.includes(review.app)) || [];
      const nextReportReferences = prev.reportReferences?.filter((reference) => newCompanies.includes(reference.app)) || [];

      return {
        ...prev,
        companies: newCompanies,
        activeBlocks: newActiveBlocks,
        filters: newFilters,
        data: newData,
        chatHistory: newChatHistory,
        customBlocks: newCustomBlocks,
        reportReviews: nextReportReviews,
        reportReferences: nextReportReferences,
        reportSourcesStatus: deriveReportSourcesStatus(nextReportReviews, newCompanies),
      };
    });

    if (companiesNeedingEvidence.size > 0) {
      const addedCompanies = Array.from(companiesNeedingEvidence);
      const evidenceSets = await Promise.all(
        addedCompanies.map(async (company) => {
          const reportId = updatedReports?.[company] || state.reportId;
          if (!reportId) {
            return { company, reportReviews: [], reportReferences: [] };
          }
          const evidence = await fetchReportEvidence(reportId, [company]);
          return { company, ...evidence };
        })
      );

      setState((prev) => {
        const mergedReviews = [...(prev.reportReviews || [])];
        const mergedReferences = [...(prev.reportReferences || [])];

        evidenceSets.forEach((evidence) => {
          evidence.reportReviews.forEach((review) => {
            if (!mergedReviews.some((item) => item.id === review.id)) {
              mergedReviews.push(review);
            }
          });
          evidence.reportReferences.forEach((reference) => {
            if (!mergedReferences.some((item) => item.id === reference.id)) {
              mergedReferences.push(reference);
            }
          });
        });

        return {
          ...prev,
          reportReviews: mergedReviews,
          reportReferences: mergedReferences,
          reportSourcesStatus: deriveReportSourcesStatus(mergedReviews, prev.companies),
        };
      });
    }
  };

  const executeChatCommand = async (userMsg: string) => {
    if (!userMsg.trim() || isClassifying) return;

    const userMessageObj: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: userMsg,
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, userMessageObj],
    }));

    setIsClassifying(true);

    try {
      if (state.phase === "report" && state.reportId && !looksLikeMutationCommand(userMsg)) {
        await runGroundedChat(userMsg);
      } else {
        await runMutationChat(userMsg);
      }
    } catch (err: any) {
      console.error(err);
      setState((prev) => ({
        ...prev,
        chatHistory: [
          ...prev.chatHistory,
          {
            id: `err-${Date.now()}`,
            role: "agent",
            text: "Sorry, I had an issue analyzing that instruction. Feel free to refine or ask me something else!",
            timestamp: Date.now(),
          },
        ],
      }));
    } finally {
      setIsClassifying(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isClassifying) return;
    const userMsg = chatInput;
    setChatInput("");
    await executeChatCommand(userMsg);
  };

  // Helper filters application inside components
  const applyFilterClass = (sent: string) => {
    const f = state.filters.sentiment;
    if (f === "all") return true;
    return f === sent;
  };

  return (
    <div id="app_root" className={`min-h-screen bg-[#F0F4F9] text-[#1F1F1F] font-sans antialiased transition-all duration-300 flex flex-col justify-between ${state.phase === "report" ? "h-screen overflow-hidden" : ""}`}>
      
      {/* Dynamic Alerts */}
      {alertMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-100 border border-red-200 text-red-800 p-4 rounded-xl shadow-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-medium">{alertMessage}</span>
          <button onClick={() => setAlertMessage(null)} className="hover:bg-red-200 p-1 rounded-full text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PHASE 1: SEARCH-FIRST STANDARD LANDING PAGE */}
      {state.phase === "search" && (
        <div className="min-h-screen flex flex-col justify-center items-center px-4 md:px-6 relative bg-gradient-to-br from-[#EBF3FC] via-[#F6FAFE] to-[#DFEDFD] overflow-hidden">
          {/* Ambient Glow Orbs */}
          <div className="absolute top-[10%] left-[10%] w-[32rem] h-[32rem] bg-blue-300/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[10%] right-[10%] w-[32rem] h-[32rem] bg-indigo-200/25 rounded-full blur-[120px] pointer-events-none" />

          <div className="w-full max-w-2xl text-center relative z-10">

            {/* Giant soft typography headings with Google style primary color */}
            <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-3">
              Market Review <span className="text-[#0b57d0]">Analyst</span>
            </h1>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 max-w-sm mx-auto">
              Synthesize customer feedback, analyze ratings, and compare e-wallet competitor insights instantly.
            </p>

            {/* Google M3-style search input with continuous rotating border gradient element */}
            <form onSubmit={handleSearchSubmit} className="relative mb-12 max-w-lg mx-auto">
              <div className="relative p-[2px] rounded-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] via-[#34A853] to-[#4285F4] animate-border-run transition-all duration-300 shadow-sm focus-within:shadow-md">
                <div className="relative flex items-center rounded-full bg-white">
                  <Search className="absolute left-4 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    id="search_bar"
                    placeholder="Scan e-wallet reviews, tech forums, or competitor..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full pl-12 pr-6 py-3.5 bg-transparent text-[#1F1F1F] text-sm font-normal placeholder-gray-400 focus:outline-none rounded-full"
                  />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0]"></span>
                <span>Type and press Enter to start Google Synthesis Engine</span>
              </div>
            </form>

            {/* Suggestions list chips */}
            <div className="flex flex-col items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suggested Scenarios</span>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    id={`suggest_chip_${idx}`}
                    onClick={() => handleChipClick(s)}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50/80 text-slate-700 rounded-full border border-gray-200 shadow-2xs hover:border-[#0b57d0]/30 transition-all duration-150 shrink-0 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* PHASE 1.2: HUMAN-IN-THE-LOOP REFINEMENT/CONFIRMATION WORKSPACE */}
      {(state.phase === "clarify" || state.phase === "confirm") && (
        <div className="min-h-screen py-12 px-4 md:px-8 max-w-4xl mx-auto flex flex-col justify-center animate-fade-in">
          {isPreparingConfirm ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-xl p-8 max-w-md mx-auto">
              {/* Spinning gradient ring */}
              <div className="relative w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-slate-50"></div>
                <div className="absolute inset-0 rounded-full border-4 border-dashed border-blue-600 animate-spin"></div>
                <Sparkles className="relative w-5 h-5 text-blue-600 animate-pulse" />
              </div>
              <h2 className="text-lg font-medium text-slate-800 mb-2">Analyzing Query</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                OpenClaw is parsing product context and shaping the next research step...
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[760px] md:h-[760px] max-w-4xl mx-auto w-full">
              <div className="w-full md:w-64 bg-slate-50 border-r border-gray-150 p-6 flex flex-col justify-between shrink-0 md:h-full">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Bot className="w-4 h-4 text-blue-600 animate-pulse" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setup Assistant</span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Setup Steps</h3>
                  </div>
                  <div className="space-y-2.5 md:max-h-[560px] md:overflow-y-auto pr-1">
                    {(state.phase === "clarify"
                      ? setup.steps.map((step, idx) => ({
                          label: step.title,
                          stepIndex: idx,
                        }))
                      : [{ label: "Confirm Plan", stepIndex: 0 }]
                    ).map((step, idx) => {
                      const isActive = state.phase === "clarify" ? setup.currentStep === step.stepIndex : true;
                      const isCompleted = state.phase === "clarify" ? setup.currentStep > step.stepIndex : false;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (state.phase === "clarify") {
                              updateSetup((prev) => ({ ...prev, currentStep: step.stepIndex }));
                            }
                          }}
                          className={`w-full flex items-center gap-3 text-left p-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-transparent ${
                            isActive
                              ? "bg-blue-50 text-blue-850 border-blue-50"
                              : isCompleted
                              ? "text-emerald-700 hover:bg-slate-100/50"
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100/30"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : isCompleted
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-200 text-slate-500"
                          }`}>
                            {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                          </div>
                          <span className="truncate">{step.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200/60 mt-6">
                  <button
                    onClick={handleReset}
                    className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors cursor-pointer block"
                  >
                    Cancel Setup &amp; Reset
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-between p-6 md:p-8 bg-white h-full min-h-0">
                <div className="flex-1 overflow-y-auto pr-2 min-h-[520px] md:min-h-0 mb-4">
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Setup Progress</span>
                      <span className="text-blue-600 font-mono">
                        {state.phase === "clarify"
                          ? `${Math.round((((setup.currentStep || 0) + 1) / Math.max(setup.steps.length, 1)) * 100)}%`
                          : "100%"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                        style={{
                          width:
                            state.phase === "clarify"
                              ? `${Math.round((((setup.currentStep || 0) + 1) / Math.max(setup.steps.length, 1)) * 100)}%`
                              : "100%",
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl rounded-tl-none max-w-lg shadow-2xs">
                      <p className="text-xs text-slate-705 leading-relaxed font-sans font-medium">
                        {state.phase === "clarify"
                          ? currentStep?.question.question || "Let's refine this request before we start."
                          : "I've compiled the research intent and verified the apps I could confidently match from the stores. Please confirm the plan before analysis begins."}
                      </p>
                    </div>
                  </div>

                  <div className="py-2 min-h-[340px] flex flex-col">
                    {state.phase === "clarify" && currentStep && (
                      <div className="space-y-4 flex-1">
                        {setup.reason && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                            {setup.reason}
                          </div>
                        )}
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {currentStep.title}
                        </label>

                        {currentStep.question.type === "text" && (
                          <input
                            type="text"
                            className="w-full px-4 py-3 bg-white border border-gray-250 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs"
                            value={typeof setup.answers[currentStep.step_id] === "string" ? String(setup.answers[currentStep.step_id]) : ""}
                            onChange={(e) => setStepAnswer(currentStep.step_id, e.target.value)}
                            placeholder={typeof currentStep.question.recommended === "string" ? currentStep.question.recommended : "Type your answer"}
                          />
                        )}

                        {currentStep.question.type === "single_select" && (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-2">
                              {currentStep.question.choices.map((choice) => {
                                const isSelected = setup.answers[currentStep.step_id] === choice;
                                return (
                                  <button
                                    key={choice}
                                    type="button"
                                    onClick={() => setStepAnswer(currentStep.step_id, choice)}
                                    className={`text-left text-xs p-3 rounded-xl border transition-all duration-150 flex items-center justify-between cursor-pointer ${
                                      isSelected
                                        ? "bg-blue-50 border-blue-400 text-blue-900 font-bold"
                                        : "bg-white border-gray-200 hover:bg-slate-50 text-slate-700"
                                    }`}
                                  >
                                    <span>{choice}</span>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>
                                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {currentStep.question.allow_other && (
                              <input
                                type="text"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-xs"
                                placeholder="Or type your own answer"
                                value={customStepInput[currentStep.step_id] ?? (typeof setup.answers[currentStep.step_id] === "string" && !currentStep.question.choices.includes(String(setup.answers[currentStep.step_id])) ? String(setup.answers[currentStep.step_id]) : "")}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setCustomStepInput((prev) => ({ ...prev, [currentStep.step_id]: value }));
                                  setStepAnswer(currentStep.step_id, value);
                                }}
                              />
                            )}
                          </div>
                        )}

                        {currentStep.question.type === "multi_select" && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {currentStep.question.choices.map((choice) => {
                                const selectedValues = Array.isArray(setup.answers[currentStep.step_id]) ? setup.answers[currentStep.step_id] as string[] : [];
                                const isSelected = selectedValues.includes(choice);
                                return (
                                  <button
                                    key={choice}
                                    type="button"
                                    onClick={() => toggleMultiSelectChoice(currentStep.step_id, choice)}
                                    className={`px-3.5 py-2 rounded-full border text-xs font-semibold transition ${
                                      isSelected ? "bg-blue-50 border-blue-400 text-blue-900" : "bg-white border-gray-200 text-slate-700"
                                    }`}
                                  >
                                    {choice}
                                  </button>
                                );
                              })}
                            </div>
                            {currentStep.question.allow_other && (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-xs"
                                  placeholder="Add another competitor"
                                  value={customStepInput[currentStep.step_id] ?? ""}
                                  onChange={(e) => setCustomStepInput((prev) => ({ ...prev, [currentStep.step_id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addCustomChoiceToStep(currentStep.step_id);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => addCustomChoiceToStep(currentStep.step_id)}
                                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
                                >
                                  Add
                                </button>
                              </div>
                            )}
                            {Array.isArray(setup.answers[currentStep.step_id]) && (setup.answers[currentStep.step_id] as string[]).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {(setup.answers[currentStep.step_id] as string[]).map((value) => (
                                  <span key={value} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                    {value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {currentStep.question.type === "boolean" && (
                          <div className="flex gap-3">
                            {[true, false].map((choice) => {
                              const isSelected = setup.answers[currentStep.step_id] === choice;
                              return (
                                <button
                                  key={String(choice)}
                                  type="button"
                                  onClick={() => setStepAnswer(currentStep.step_id, choice)}
                                  className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition ${
                                    isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-gray-200"
                                  }`}
                                >
                                  {choice ? "Yes" : "No"}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {state.phase === "confirm" && (
                      <div className="space-y-5 flex-1">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs leading-relaxed text-slate-700">{setup.summary || "Please review the generated analysis plan."}</p>
                        </div>

                        {setup.intent && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-white p-3 rounded-xl border border-gray-150">
                              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Subject</span>
                              <span className="text-xs font-bold text-slate-850">{setup.intent.subject}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-150">
                              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Audience</span>
                              <span className="text-xs font-bold text-slate-850">{setup.intent.audience}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-150">
                              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Focus</span>
                              <span className="text-xs font-bold text-slate-850">{setup.intent.focus}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-150">
                              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Objective</span>
                              <span className="text-xs font-bold text-slate-850">{setup.intent.objective}</span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Verified Apps</h3>
                            <span className="text-[11px] text-slate-400">{setup.apps.length} matched</span>
                          </div>
                          {setup.apps.length === 0 ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                              I could not confidently verify any app on the public stores. Please go back and refine the product names.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {setup.apps.map((app) => (
                                <div key={app.name} className="flex items-center gap-3 p-3 border rounded-xl">
                                  {app.iconUrl ? (
                                    <img src={app.iconUrl} alt={app.name} className="w-10 h-10 rounded-xl object-cover" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                                      <Database className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm text-slate-900">{app.name}</div>
                                    <div className="text-xs text-gray-400">
                                      {app.playId ? "Play Store ✓ " : ""}
                                      {app.appStoreId ? "App Store ✓" : ""}
                                    </div>
                                  </div>
                                  <button onClick={() => removeResolvedApp(app.name)} className="ml-auto text-red-400 hover:text-red-600">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-150 pt-5 mt-6 flex justify-between items-center bg-white">
                  <div>
                    {state.phase === "clarify" && setup.currentStep > 0 ? (
                      <button
                        type="button"
                        onClick={handleWizardBack}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-250 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Go Back</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleWizardBack}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-250 hover:bg-red-50 hover:text-red-700 text-slate-600 text-xs font-semibold transition cursor-pointer"
                      >
                        {state.phase === "confirm" ? "Start Over" : "Cancel Setup"}
                      </button>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      disabled={state.phase === "clarify" ? !currentStepHasAnswer() : setup.apps.length === 0}
                      onClick={handleWizardContinue}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      {state.phase === "clarify" ? (
                        <>
                          <span>{setup.currentStep === setup.steps.length - 1 ? "Submit Answers" : "Continue"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Confirm &amp; Launch Analysis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PHASE 1.5: GENERATIVE LOADING SCREEN */}
      {state.phase === "loading" && (
        <div className="min-h-screen flex flex-col justify-center items-center bg-white px-4">
          <div className="max-w-md w-full text-center">
            
            {/* Minimal high-end modern spinner */}
            <div className="relative w-16 h-16 mx-auto mb-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-50"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              <Sparkles className="relative w-5 h-5 text-blue-600 animate-pulse" />
            </div>

            <h2 className="text-xl font-light text-[#1F1F1F] mb-1">{loadingMessage || "Starting analysis..."}</h2>
            <p className="text-xs text-gray-450 mb-8 uppercase tracking-wide">Crawling real reviews from app stores and forums</p>

            <div className="bg-gray-50 p-5 rounded-xl text-left border border-gray-255">
              <div className="flex items-center gap-3 text-xs text-[#1F1F1F] font-semibold">
                <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></div>
                <span>{state.reportStatus === "running" ? "Pipeline is processing live data" : "Preparing crawler pipeline"}</span>
              </div>
            </div>

            <div className="mt-8 text-[10px] text-gray-400 text-center uppercase">
              Report ID {state.reportId || "pending"}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: DASHBOARD CANVAS & CHAT LAYOUT */}
      {state.phase === "report" && (
        <div ref={containerRef} className="flex-1 flex flex-col md:flex-row min-h-0 bg-[#f4f5f7] text-slate-900 font-sans">
          
          {/* MAIN CONTAINER FOR HEADER + SIDE-BY-SIDE SPLITLAYOUT */}
          <main className="flex-1 flex flex-col min-w-0 bg-gray-50 overflow-hidden">
            
            <ReportHeader
              state={state}
              onReset={handleReset}
              onOpenSources={() => setIsSourcesModalOpen(true)}
              onGeneratePDF={handleGeneratePDF}
              isChatPaneOpen={isChatPaneOpen}
              onToggleChatPane={() => setIsChatPaneOpen(!isChatPaneOpen)}
            />

            {/* SPLIT SCREEN WORKSPACE CONTENT AREA */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative font-sans">
              
              {/* LEFT COLUMN: DOCUMENT BRIEF (REPORT BLOCKS CANVAS) */}
              <ReportBrief
                state={state}
                openDrawers={openDrawers}
                toggleDrawer={toggleDrawer}
                executeChatCommand={executeChatCommand}
                chatInput={chatInput}
                setChatInput={setChatInput}
                handleChatSubmit={handleChatSubmit}
                reportReviews={state.reportReviews || []}
                reportSourcesStatus={state.reportSourcesStatus || null}
              />

              {/* Hidden old left canvas block */}
              <div className="hidden">
                <div className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto">
                
                {state.activeBlocks.length === 0 ? (
                  <div className="bg-white p-12 rounded-xl border border-gray-200 text-center max-w-sm mx-auto shadow-xs my-10">
                    <BarChart3 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">Canvas is empty</h3>
                    <p className="text-xs text-gray-500 mb-4 leading-relaxed">You have toggled off all report blocks. Choose blocks you want to view inside the left sidebar panel.</p>
                    <button
                      onClick={() => setState((prev) => ({ ...prev, activeBlocks: DEFAULT_BLOCKS }))}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs transition-all cursor-pointer"
                    >
                      Restore Defaults
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 max-w-5xl mx-auto">
                    
                    {/* print letterhead header */}
                    <div className="print-only-header p-6 mb-4 bg-white border border-gray-200 rounded-xl">
                      <div className="flex items-center justify-between pb-3.5 border-b-2 border-[#0b57d0]">
                        <div>
                          <p className="text-[9px] font-bold text-[#0b57d0] uppercase tracking-wider mb-0.5 font-sans">Automated Intelligence Report</p>
                          <h1 className="text-lg font-bold text-slate-800 tracking-tight font-sans">App Store Reviews & Sentiment Benchmarks</h1>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-sans ml-auto">Run Date</p>
                          <p className="text-xs font-bold text-slate-705 font-sans">{new Date().toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3.5 text-[11px] text-slate-600 bg-slate-50/50 p-3 rounded-lg border border-gray-150">
                        <div>
                          <strong className="text-slate-800 font-semibold font-sans">Initial Query:</strong> "{state.query}"
                        </div>
                        <div>
                          <strong className="text-slate-800 font-semibold font-sans">Subjects Compared:</strong> {state.companies.join(", ")}
                        </div>
                      </div>
                    </div>
                    
                    {/* OVERVIEW METRICS BLOCK */}
                    {state.activeBlocks.includes("metrics") && (
                      <div id="block_metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {state.companies.map((company) => {
                          const cData = state.data[company];
                          if (!cData) return null;
                          return (
                            <div key={company} className="bg-white p-5 rounded-xl border border-transparent hover:border-black shadow-xs transition duration-200">
                               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{company} Avg Rating</p>
                               <div className="flex items-end gap-2">
                                 <span className="text-3xl font-light text-slate-900 leading-none">{cData.rating.toFixed(1)}</span>
                                 <span className="text-xs text-emerald-600 font-bold pb-0.5 flex items-center">
                                   ★ {(cData.reviewCount > 1500) ? "+0.2 ↑" : "steady"}
                                 </span>
                               </div>
                               <p className="text-[10px] text-gray-400 mt-1.5 uppercase">Based on {cData.reviewCount.toLocaleString()} reviews</p>
                            </div>
                          );
                        })}
                        
                        {/* Muted Warning Flag element */}
                        <div className="bg-white p-5 rounded-xl border border-transparent hover:border-black shadow-xs transition duration-200">
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Trend Diagnostics</p>
                           <div className="flex items-end gap-2">
                             <span className="text-xl font-bold text-slate-800 leading-none">Spiking Crash Calls</span>
                           </div>
                           <p className="text-[10px] text-red-500 font-semibold mt-1.5 uppercase">Android v76 Memory crash triggers</p>
                        </div>
                      </div>
                    )}

                    {/* TOPIC INSIGHTS AND DISTRIBUTION ROW */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      
                      {/* KEY COMPLAINTS / INSIGHT PANEL */}
                      {state.activeBlocks.includes("insights") && (
                        <div id="block_insights" className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                          <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                            <h2 className="text-sm font-semibold text-slate-800">Critical Concerns &amp; Topics</h2>
                            <button
                              onClick={() => handleToggleBlock("insights")}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                              title="Hide block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-4 overflow-y-auto max-h-[360px] pr-1.5">
                            {state.companies.map((company) => {
                              const cData = state.data[company];
                              if (!cData || !cData.insights) return null;
                              return (
                                <div key={company} className="space-y-2.5">
                                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                                    {company} Segment Feedback:
                                  </div>
                                  {cData.insights.map((insight, idx) => {
                                    const isHigh = insight.severity === "high";
                                    const isMed = insight.severity === "medium";
                                    return (
                                      <div key={idx} className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 transition hover:bg-gray-100/30">
                                        <div className="flex justify-between items-start mb-1.5">
                                          <span className="font-semibold text-xs text-slate-800">[{insight.topic}] Focus area</span>
                                          <span className={`px-2 py-0.5 text-[8.5px] font-extrabold rounded-md uppercase ${
                                            isHigh ? "bg-red-50 text-red-650 text-red-600" : isMed ? "bg-amber-50 text-amber-650 text-amber-600" : "bg-slate-100 text-slate-600"
                                          }`}>
                                            {insight.severity} Priority
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed">
                                          {insight.text}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* COMPLAINT TOPIC DISTRIBUTION SPECIFICS */}
                      {state.activeBlocks.includes("topic_bar") && (
                        <div id="block_topic_bar" className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                          <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                            <h2 className="text-sm font-semibold text-slate-800">Topic Volume Split</h2>
                            <button
                              onClick={() => handleToggleBlock("topic_bar")}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                              title="Hide block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-4 overflow-y-auto max-h-[360px] pr-1">
                            {state.companies.map((company) => {
                              const cData = state.data[company];
                              if (!cData || !cData.topicCounts) return null;
                              const topics = Object.keys(cData.topicCounts);
                              const totalTopicSum = (Object.values(cData.topicCounts) as number[]).reduce((a: number, b: number) => a + b, 0) || 1;

                              return (
                                <div key={company} className="p-4 bg-gray-50 rounded-lg border border-gray-200/50">
                                  <p className="text-[10px] font-bold text-gray-450 uppercase tracking-widest mb-3.5">
                                    {company} Distribution Matrix
                                  </p>
                                  <div className="space-y-3.5 font-sans">
                                    {topics.map((top, tIdx) => {
                                      const val = (cData.topicCounts[top] || 0) as number;
                                      const percentage = Math.round((val / totalTopicSum) * 100);
                                      
                                      // Polished Elegant Steel-Blue and Muted Palette
                                      const colors = ["bg-blue-600", "bg-slate-600", "bg-emerald-600", "bg-rose-500", "bg-amber-500"];
                                      const targetColor = colors[tIdx % colors.length];

                                      return (
                                        <div key={top} className="space-y-1">
                                          <div className="flex justify-between text-[11px] font-medium">
                                            <span className="text-slate-650">{top}</span>
                                            <span className="font-bold text-slate-900">{percentage}%</span>
                                          </div>
                                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden border border-gray-300/10">
                                            <div className={`h-full ${targetColor} transition-all duration-300`} style={{ width: `${percentage}%` }}></div>
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
                      )}

                    </div>

                    {/* SENTIMENT SPLITS AND TREND DIAGRAMS */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      
                      {/* SENTIMENT BREAKDOWN MATRIX */}
                      {state.activeBlocks.includes("sentiment_pie") && (
                        <div id="block_sentiment_pie" className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                          <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                            <h2 className="text-sm font-semibold text-slate-800">Customer Sentiment Split</h2>
                            <button
                              onClick={() => handleToggleBlock("sentiment_pie")}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                              title="Hide block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center justify-items-center flex-1 py-1">
                             {state.companies.map((company) => {
                               const cData = state.data[company];
                               if (!cData || !cData.sentimentBreakdown) return null;
                               const { pos, neu, neg } = cData.sentimentBreakdown;
                               
                               const r = 24;
                               const circ = 2 * Math.PI * r;
                               const strokePos = (pos / 100) * circ;
                               const strokeNeu = (neu / 100) * circ;
                               const strokeNeg = (neg / 100) * circ;
 
                               const isHovered = hoveredSentimentCompany === company;
                               const activeSeg = isHovered ? hoveredSentimentSegment : null;

                               return (
                                 <div key={company} className="flex flex-col items-center p-4 rounded-xl bg-gray-50 border border-gray-200 w-full hover:bg-gray-100/50 transition duration-150">
                                   <span className="text-xs font-semibold text-slate-700 mb-3 truncate max-w-full">
                                     {company} App Sat Index
                                   </span>
                                   
                                   <div className="relative w-28 h-28 flex items-center justify-center">
                                     <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                                       <circle cx="32" cy="32" r={r} fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
                                       {/* Mint positive */}
                                       <circle cx="32" cy="32" r={r} fill="transparent" stroke="#10b981" strokeWidth={activeSeg === "pos" ? 8.1 : 6.1}
                                         strokeDasharray={`${strokePos} ${circ}`} strokeDashoffset={0}
                                         className="cursor-pointer transition-all duration-150"
                                         onMouseEnter={() => {
                                           setHoveredSentimentCompany(company);
                                           setHoveredSentimentSegment("pos");
                                         }}
                                         onMouseLeave={() => {
                                           setHoveredSentimentCompany(null);
                                           setHoveredSentimentSegment(null);
                                         }}
                                       />
                                       {/* Sand Neutral */}
                                       <circle cx="32" cy="32" r={r} fill="transparent" stroke="#f59e0b" strokeWidth={activeSeg === "neu" ? 8.1 : 6.1}
                                         strokeDasharray={`${strokeNeu} ${circ}`} strokeDashoffset={-strokePos}
                                         className="cursor-pointer transition-all duration-150"
                                         onMouseEnter={() => {
                                           setHoveredSentimentCompany(company);
                                           setHoveredSentimentSegment("neu");
                                         }}
                                         onMouseLeave={() => {
                                           setHoveredSentimentCompany(null);
                                           setHoveredSentimentSegment(null);
                                         }}
                                       />
                                       {/* Premium Crimson Negative */}
                                       <circle cx="32" cy="32" r={r} fill="transparent" stroke="#ef4444" strokeWidth={activeSeg === "neg" ? 8.1 : 6.1}
                                         strokeDasharray={`${strokeNeg} ${circ}`} strokeDashoffset={-(strokePos + strokeNeu)}
                                         className="cursor-pointer transition-all duration-150"
                                         onMouseEnter={() => {
                                           setHoveredSentimentCompany(company);
                                           setHoveredSentimentSegment("neg");
                                         }}
                                         onMouseLeave={() => {
                                           setHoveredSentimentCompany(null);
                                           setHoveredSentimentSegment(null);
                                         }}
                                       />
                                     </svg>
                                     <div className="absolute text-center mt-[-1px] select-none pointer-events-none">
                                       {activeSeg === "pos" ? (
                                         <>
                                           <span className="text-base font-bold text-emerald-600 block tracking-tight">{pos}%</span>
                                           <span className="text-[8px] text-emerald-500 block uppercase tracking-wider font-semibold">Positive</span>
                                         </>
                                       ) : activeSeg === "neu" ? (
                                         <>
                                           <span className="text-base font-bold text-amber-500 block tracking-tight">{neu}%</span>
                                           <span className="text-[8px] text-amber-500 block uppercase tracking-wider font-semibold">Neutral</span>
                                         </>
                                       ) : activeSeg === "neg" ? (
                                         <>
                                           <span className="text-base font-bold text-red-500 block tracking-tight">{neg}%</span>
                                           <span className="text-[8px] text-red-500 block uppercase tracking-wider font-semibold">Negative</span>
                                         </>
                                       ) : (
                                         <>
                                           <span className="text-base font-bold text-slate-800 block tracking-tight">{neu + pos}%</span>
                                           <span className="text-[8px] text-slate-450 block uppercase tracking-wider font-semibold">Sat. Vol</span>
                                         </>
                                       )}
                                     </div>
                                   </div>
 
                                   <div className="w-full mt-3 grid grid-cols-3 gap-1.5 text-center text-[9px]">
                                     <div 
                                       onMouseEnter={() => { setHoveredSentimentCompany(company); setHoveredSentimentSegment("pos"); }}
                                       onMouseLeave={() => { setHoveredSentimentCompany(null); setHoveredSentimentSegment(null); }}
                                       className={`p-1 rounded border transition-all duration-100 cursor-help ${activeSeg === "pos" ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200/50"}`}
                                     >
                                       <span className="block text-emerald-600 font-bold">{pos}%</span>
                                       <span className="text-gray-400">POS</span>
                                     </div>
                                     <div 
                                       onMouseEnter={() => { setHoveredSentimentCompany(company); setHoveredSentimentSegment("neu"); }}
                                       onMouseLeave={() => { setHoveredSentimentCompany(null); setHoveredSentimentSegment(null); }}
                                       className={`p-1 rounded border transition-all duration-100 cursor-help ${activeSeg === "neu" ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200/50"}`}
                                     >
                                       <span className="block text-amber-500 font-bold">{neu}%</span>
                                       <span className="text-gray-400">NEU</span>
                                     </div>
                                     <div 
                                       onMouseEnter={() => { setHoveredSentimentCompany(company); setHoveredSentimentSegment("neg"); }}
                                       onMouseLeave={() => { setHoveredSentimentCompany(null); setHoveredSentimentSegment(null); }}
                                       className={`p-1 rounded border transition-all duration-100 cursor-help ${activeSeg === "neg" ? "bg-red-50 border-red-350" : "bg-white border-gray-200/50"}`}
                                     >
                                       <span className="block text-[#ef4444] font-bold">{neg}%</span>
                                       <span className="text-gray-400">NEG</span>
                                     </div>
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                        </div>
                      )}

                      {/* NEGATIVE CRITICAL ACCUMULATION INDEX */}
                      {state.activeBlocks.includes("trend") && (
                        <div id="block_trend" className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                          <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                            <h2 className="text-sm font-semibold text-slate-800">Negative Sentiment % Index (30d)</h2>
                            <button
                              onClick={() => handleToggleBlock("trend")}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                              title="Hide block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col justify-between flex-1">
                            <div className="h-32 w-full">
                              <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                                <line x1="0" y1="20" x2="500" y2="20" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3 3" />
                                <line x1="0" y1="60" x2="500" y2="60" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3 3" />
                                <line x1="0" y1="100" x2="500" y2="100" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3 3" />

                                {hoveredTrendIndex !== null && (
                                  <line 
                                    x1={hoveredTrendIndex * (500 / ((state.data[state.companies[0]]?.trendData?.length || 2) - 1 || 1))} 
                                    y1="0" 
                                    x2={hoveredTrendIndex * (500 / ((state.data[state.companies[0]]?.trendData?.length || 2) - 1 || 1))} 
                                    y2="120" 
                                    stroke="#cbd5e1" 
                                    strokeWidth="1.5" 
                                    strokeDasharray="2 2" 
                                    className="pointer-events-none" 
                                  />
                                )}

                                {state.companies.map((company, cIdx) => {
                                  const cData = state.data[company];
                                  if (!cData || !cData.trendData) return null;
                                  
                                  // Polished color scheme
                                  const colors = ["#ef4444", "#3b82f6", "#64748b", "#10b981"];
                                  const curveColor = colors[cIdx % colors.length];

                                  const points = cData.trendData;
                                  const widthStep = 500 / (points.length - 1 || 1);
                                  
                                  const getSvgY = (val: number) => {
                                    const scaled = (val / 60) * 90;
                                    return 110 - scaled;
                                  };

                                  let pathD = "";
                                  points.forEach((val, pIdx) => {
                                    const x = pIdx * widthStep;
                                    const y = getSvgY(val);
                                    if (pIdx === 0) {
                                      pathD = `M ${x} ${y}`;
                                    } else {
                                      pathD += ` L ${x} ${y}`;
                                    }
                                  });

                                  return (
                                    <g key={company}>
                                      <path d={pathD} fill="none" stroke={curveColor} strokeWidth="2.0" className="transition-all duration-300" />
                                      {points.map((val, pIdx) => {
                                        const x = pIdx * widthStep;
                                        const y = getSvgY(val);
                                        const isPointHovered = hoveredTrendIndex === pIdx;
                                        return (
                                          <circle
                                            key={pIdx}
                                            cx={x}
                                            cy={y}
                                            r={isPointHovered ? 5.5 : 3}
                                            fill={curveColor}
                                            stroke={isPointHovered ? "#ffffff" : "transparent"}
                                            strokeWidth="1.5"
                                            className="cursor-pointer transition-all duration-150"
                                            onMouseEnter={() => setHoveredTrendIndex(pIdx)}
                                            onMouseLeave={() => setHoveredTrendIndex(null)}
                                          />
                                        );
                                      })}
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>

                            {/* INTERACTIVE TREND HOVER TOOLTIP ROW */}
                            {hoveredTrendIndex !== null && (
                              <div className="bg-white p-2 border border-blue-100 rounded-lg flex items-center justify-between text-[11px] animate-fade-in mt-1.5 no-print">
                                <span className="font-semibold text-slate-700">Days Segment {hoveredTrendIndex + 1}:</span>
                                <div className="flex gap-3">
                                  {state.companies.map((company, cIdx) => {
                                    const pVal = state.data[company]?.trendData?.[hoveredTrendIndex];
                                    if (pVal === undefined) return null;
                                    const colors = ["text-[#ef4444]", "text-[#3b82f6]", "text-[#64748b]", "text-[#10b981]"];
                                    return (
                                      <span key={company} className="font-bold">
                                        {company}: <span className={colors[cIdx % colors.length]}>{pVal}%</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs justify-between text-[10px]">
                              <div className="flex flex-wrap items-center gap-2">
                                {state.companies.map((company, cIdx) => {
                                  const colors = ["bg-red-500", "bg-blue-500", "bg-slate-500", "bg-emerald-500"];
                                  const dotColor = colors[cIdx % colors.length];
                                  return (
                                    <div key={company} className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-gray-150">
                                      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                                      <span className="font-semibold text-slate-700 text-[9px]">{company}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <span className="text-gray-400">ACCUMULATION FREQUENCY SPLIT</span>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* ACTION PROPOSALS AND ROADMAP SECTIONS */}
                    {state.activeBlocks.includes("actions") && (
                      <div id="block_actions" className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                          <h2 className="text-sm font-semibold text-slate-800">Tactical Action Prescriptions</h2>
                          <button
                            onClick={() => handleToggleBlock("actions")}
                            className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                            title="Hide block"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          
                          {/* PRODUCT OWNER */}
                          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 flex flex-col">
                            <div className="flex items-center gap-1.5 mb-3">
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-[9px] font-bold text-blue-700 uppercase">PO</span>
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Product Dev</span>
                            </div>
                            <ul className="space-y-3 text-xs text-slate-600 flex-1 leading-relaxed">
                              {state.companies.map((company) => {
                                const list = state.data[company]?.actions?.PO || [];
                                return list.map((act, idx) => (
                                  <li key={`${company}-${idx}`} className="flex items-start gap-1.5">
                                    <span className="text-blue-500 font-bold shrink-0">•</span>
                                    <span><strong className="text-slate-800 font-semibold">{company}:</strong> {act}</span>
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>

                          {/* QA DESIGN */}
                          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 flex flex-col">
                            <div className="flex items-center gap-1.5 mb-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-[9px] font-bold text-emerald-700 uppercase">QA</span>
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Quality Checks</span>
                            </div>
                            <ul className="space-y-3 text-xs text-slate-600 flex-1 leading-relaxed">
                              {state.companies.map((company) => {
                                const list = state.data[company]?.actions?.QA || [];
                                return list.map((act, idx) => (
                                  <li key={`${company}-${idx}`} className="flex items-start gap-1.5">
                                    <span className="text-emerald-500 font-bold shrink-0">•</span>
                                    <span><strong className="text-slate-800 font-semibold">{company}:</strong> {act}</span>
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>

                          {/* MARKETING / BRAND STRATEGY */}
                          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 flex flex-col">
                            <div className="flex items-center gap-1.5 mb-3">
                              <span className="px-2 py-0.5 rounded bg-slate-200 text-[9px] font-bold text-slate-800 uppercase">MKT</span>
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Brand Growth</span>
                            </div>
                            <ul className="space-y-3 text-xs text-slate-600 flex-1 leading-relaxed">
                              {state.companies.map((company) => {
                                const list = state.data[company]?.actions?.Marketing || [];
                                return list.map((act, idx) => (
                                  <li key={`${company}-${idx}`} className="flex items-start gap-1.5">
                                    <span className="text-slate-650 font-bold shrink-0">•</span>
                                    <span><strong className="text-slate-800 font-semibold">{company}:</strong> {act}</span>
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CUSTOM AI GENERATED BLOCKS */}
                    {state.customBlocks && state.customBlocks.map((block) => (
                      <div key={block.id} className="bg-white rounded-xl border border-transparent hover:border-black shadow-xs p-6 flex flex-col transition duration-200">
                        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#0b57d0] bg-[#d3e3fd] px-2 py-0.5 rounded uppercase tracking-wider font-semibold">custom ai</span>
                            <h2 className="text-sm font-semibold text-slate-800">{block.title}</h2>
                          </div>
                          <button
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                customBlocks: prev.customBlocks?.filter((b) => b.id !== block.id) || []
                              }));
                            }}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"
                            title="Delete custom block"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Rendering details per company compared */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {state.companies.map((company) => {
                            const blockData = block.data[company];
                            if (!blockData) return null;
                            const severityColors: { [key: string]: string } = {
                              high: "bg-red-50 text-red-700 border-red-200",
                              medium: "bg-amber-50 text-amber-700 border-amber-200",
                              low: "bg-blue-50 text-blue-700 border-blue-200"
                            };
                            return (
                              <div key={company} className="p-4 rounded-lg bg-gray-50 border border-gray-200 flex flex-col">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-bold text-slate-800 font-sans">{company}</span>
                                  <div className="flex items-center gap-1.5 font-sans">
                                    <span className="text-xs font-semibold text-amber-600">★ {(blockData.rating || 0).toFixed(1)}</span>
                                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${severityColors[blockData.severity] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                      {blockData.severity}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-700 font-medium mb-3 border-l-2 border-[#0b57d0] pl-2 leading-relaxed">
                                  {blockData.summary}
                                </p>
                                <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed pl-1.5 font-sans">
                                  {blockData.points && blockData.points.map((pt, pidx) => (
                                    <li key={pidx} className="flex items-start gap-1">
                                      <span className="text-[#0b57d0] font-bold shrink-0">•</span>
                                      <span>{pt}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* ADD NEW CUSTOM BLOCK COCKPIT */}
                    <div className="bg-slate-50/55 rounded-xl border border-dashed border-gray-300 hover:border-[#0b57d0] p-6 flex flex-col transition duration-200 no-print">
                      {isAddingBlock ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-[#0b57d0]" />
                              <h3 className="text-xs font-bold uppercase tracking-widest text-[#0b57d0] font-sans">Architect Custom AI Report Module</h3>
                            </div>
                            <button
                              onClick={() => {
                                setIsAddingBlock(false);
                                setCustomBlockTitle("");
                                setCustomBlockPrompt("");
                              }}
                              className="text-gray-400 hover:text-slate-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 font-sans">
                                Block Title / Theme
                              </label>
                              <input
                                type="text"
                                value={customBlockTitle}
                                onChange={(e) => setCustomBlockTitle(e.target.value)}
                                placeholder="e.g., Security & OTP Latency, User Interface Accessibility..."
                                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white font-sans text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 font-sans">
                                Custom Prompt / Directives for AI
                              </label>
                              <textarea
                                value={customBlockPrompt}
                                onChange={(e) => setCustomBlockPrompt(e.target.value)}
                                placeholder="Analyze user painpoints about login delays, SMS delivery, or biometric facial verification issues during deep nights..."
                                rows={3}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white resize-none font-sans text-slate-800"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setIsAddingBlock(false);
                                setCustomBlockTitle("");
                                setCustomBlockPrompt("");
                              }}
                              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 border border-gray-200 cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleCreateCustomBlock}
                              disabled={isGeneratingBlock || !customBlockTitle.trim() || !customBlockPrompt.trim()}
                              className="px-3 py-1.5 rounded-md bg-[#0b57d0] hover:bg-[#0842a0] disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer font-sans animate-fade-in"
                            >
                              {isGeneratingBlock ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Synthesizing...</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Generate Module</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center cursor-pointer group" onClick={() => setIsAddingBlock(true)}>
                          <div className="w-10 h-10 rounded-full bg-blue-50 group-hover:bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center mb-2.5 transition">
                            <Plus className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold text-slate-700 tracking-wide uppercase group-hover:text-[#0b57d0] font-sans">+ New Blocks</span>
                          <p className="text-[10px] text-gray-500 max-w-xs mt-1 font-sans">
                            Prompt Gemini to extract and benchmark custom topics, user complaints, or compliance factors for your compared products.
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                )}

              </div>
              </div> {/* End hidden old left canvas */}

              {/* RIGHT SIDEBAR: ASSISTANT CHAT PANEL */}
              <ReportChatPane
                state={state}
                isChatPaneOpen={isChatPaneOpen}
                isClassifying={isClassifying}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onToggleChatPane={() => setIsChatPaneOpen(!isChatPaneOpen)}
                onChatSubmit={handleChatSubmit}
                onExecuteChatCommand={executeChatCommand}
                bottomChatRef={bottomChatRef}
              />

              {/* Hidden old right panel block */}
              <div className="hidden">
                {isChatPaneOpen && (
                  <aside className="w-full md:w-[320px] lg:w-[380px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col h-[350px] md:h-full shrink-0 z-10 font-sans shadow-lg md:shadow-none">
                  
                  {/* Chat Panel Header */}
                  <div className="p-4 border-b border-gray-150 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Analyst Chat</h3>
                    </div>
                    <button 
                      onClick={() => setIsChatPaneOpen(false)}
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
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                      <BookOpen className="w-3 h-3 text-blue-600" />
                                      <span>Cited Sources ({msg.citations.length})</span>
                                    </div>
                                    <div className="space-y-1">
                                      {msg.citations.map((cite, cIdx) => (
                                        <div key={cIdx} className="text-[10px] text-slate-600 bg-slate-50 border border-gray-100 p-2 rounded">
                                          <span className="font-bold text-blue-700 block mb-0.5">{cite.source}</span>
                                          <span className="italic">"{cite.text}"</span>
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
                      <div className="flex items-center gap-2 text-xs text-slate-500 p-2 text-[11px] rounded bg-slate-50 italic animate-pulse w-max">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></div>
                        <span>Agent classifying instructions...</span>
                      </div>
                    )}
                    
                    {/* Element anchor to slide */}
                    <div ref={bottomChatRef}></div>
                  </div>

                  {/* Messaging prompt submit form */}
                  <div className="p-4 border-t border-gray-200 bg-gray-50/70">
                    {/* Suggested Commands Guide */}
                    <div className="mb-3.5 space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Quick Actions &amp; Guidelines:
                      </p>
                      <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                        <button
                          type="button"
                          onClick={() => executeChatCommand("Why is refund a top complaint?")}
                          disabled={isClassifying}
                          className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-blue-50/70 hover:bg-blue-100/90 border border-blue-250 hover:border-blue-300 text-blue-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Ask: <strong className="font-semibold">"Why is refund a top complaint?"</strong></span>
                        </button>
                        <button
                          type="button"
                          onClick={() => executeChatCommand("Add a chart for refund complaints over time.")}
                          disabled={isClassifying}
                          className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-purple-50/70 hover:bg-purple-100/90 border border-purple-250 hover:border-purple-300 text-purple-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>Modify: <strong className="font-semibold">"Add a chart for refund complaints over time."</strong></span>
                        </button>
                        <button
                          type="button"
                          onClick={() => executeChatCommand("Add ZaloPay to compare.")}
                          disabled={isClassifying}
                          className="flex items-center gap-2 px-2.5 py-2 text-left text-[11px] bg-emerald-50/70 hover:bg-emerald-100/90 border border-emerald-250 hover:border-emerald-300 text-emerald-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Compare: <strong className="font-semibold">"Add ZaloPay to compare."</strong></span>
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleChatSubmit} className="relative">
                      <div className="relative flex items-center bg-white border border-gray-300 rounded-lg h-11 px-3.5 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10">
                        <input
                          type="text"
                          placeholder="Command agent or ask details..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={isClassifying}
                          className="flex-1 bg-transparent outline-none text-xs text-slate-800 placeholder-gray-400"
                        />
                        <button
                          type="submit"
                          disabled={!chatInput.trim() || isClassifying}
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-white transition-all ${
                            chatInput.trim() && !isClassifying
                              ? "bg-slate-900 hover:bg-slate-800 cursor-pointer"
                              : "bg-gray-100 text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          <ChevronRight className="w-4 h-4 cursor-pointer" strokeWidth={3} />
                        </button>
                      </div>
                    </form>
        <p className="text-center text-[9px] text-gray-400 mt-2 uppercase">
          OpenClaw task understanding is experimental
        </p>
      </div>

                </aside>
              )}
              </div> {/* End hidden old right panel */}

            </div>

          </main>

        </div>
      )}

      {/* SOURCES AUDIT TRAIL MODAL POPUP */}
      {isSourcesModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in no-print">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-scale-up font-sans">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-150 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-[#0b57d0]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Data Sources &amp; Audit Trail
                </h3>
              </div>
              <button
                onClick={() => setIsSourcesModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-slate-800 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Sub Bar Stats */}
            <div className="p-4 bg-slate-50 border-b border-gray-150 grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="block text-[10px] uppercase font-bold text-gray-450 tracking-wider">Scraped Depth</span>
                <span className="text-sm font-bold text-slate-800">{(state.reportSourcesStatus?.totalReviews || 0).toLocaleString()} Reviews</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-gray-450 tracking-wider">Crawl Date</span>
                <span className="text-sm font-bold text-[#0b57d0]">
                  {state.reportSourcesStatus?.latestPublishedAt ? formatPublishedDate(state.reportSourcesStatus.latestPublishedAt) : "Unknown"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-gray-450 tracking-wider">Source Pools</span>
                <span className="text-sm font-bold text-emerald-600">{state.reportSourcesStatus?.sources?.join(", ") || "No sources"}</span>
              </div>
            </div>

            {/* Modal Content Scrollbox */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                  Live Reviews Scrape Log:
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Below are the real report-scoped review rows and references used to generate this brief and answer grounded chat questions:
                </p>
              </div>

              <div className="space-y-3">
                {(state.reportReviews || []).map((log, idx) => (
                  <div key={log.id || idx} className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 hover:border-[#0b57d0]/25 transition-all">
                    <div className="flex items-center justify-between text-xs sm:text-xs">
                      <div className="flex items-center gap-1.5 font-sans">
                        <span className="font-bold text-slate-800 capitalize bg-slate-200 px-2.1 py-0.5 rounded-md text-[10px]">
                          {log.app}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="font-medium text-blue-600 font-mono text-[10px]">
                          {formatReportSource(log.source)}
                        </span>
                        {log.topic && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="font-medium text-slate-500 text-[10px]">{log.topic}</span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-450 font-medium">
                        {formatPublishedDate(log.published_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 italic font-medium leading-relaxed">
                      "{log.content}"
                    </p>
                    <div className="flex items-center gap-0.5 justify-between">
                      <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, sIdx) => (
                        <span
                          key={sIdx}
                          className={`text-xs ${typeof log.rating === "number" && sIdx < log.rating ? "text-amber-500" : "text-gray-300"}`}
                        >
                          ★
                        </span>
                      ))}
                      </div>
                      {log.source_url && (
                        <a href={log.source_url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-600 hover:text-blue-700">
                          Open source
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {state.reportReviews?.length === 0 && (
                  <div className="text-xs text-slate-400 italic">No report evidence has been loaded yet.</div>
                )}
              </div>

              <div className="space-y-1 pt-3 border-t border-gray-150">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                  Ranked References:
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  These are the prioritized references attached to the generated insights.
                </p>
              </div>

              <div className="space-y-3">
                {(state.reportReferences || []).map((reference) => (
                  <div key={reference.id} className="p-3.5 bg-white border border-gray-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">#{reference.rank ?? "-"}</span>
                        <span className="font-semibold text-slate-700">{reference.app}</span>
                        <span className="text-slate-400">•</span>
                        <span className="font-medium text-blue-600">{formatReportSource(reference.source)}</span>
                        {reference.topic && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-500">{reference.topic}</span>
                          </>
                        )}
                      </div>
                      {reference.source_url && (
                        <a href={reference.source_url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">
                          Open source
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{reference.content}</p>
                  </div>
                ))}
                {state.reportReferences?.length === 0 && (
                  <div className="text-xs text-slate-400 italic">No ranked references were persisted for this report.</div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#0b57d0] shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-900 leading-relaxed space-y-1">
                  <p className="font-bold">Understanding compliance &amp; reference indices:</p>
                  <p>
                    References cited globally inside the Agent Analyst Chat system directly correspond to these review sequence indices. Scrape cache is updated automatically with every user request.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-150 flex items-center justify-end bg-slate-50/50">
              <button
                onClick={() => setIsSourcesModalOpen(false)}
                className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Close Audit Trail
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FOOTER credit */}
      <footer className="text-center py-4 text-[10px] text-gray-400 tracking-wider border-t border-gray-200 bg-white uppercase bg-gray-50/20">
        Market Research Agent • Synthesized with Google Gemini &amp; Play Store Reviews Indice
      </footer>

    </div>
  );
}
