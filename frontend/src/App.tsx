/// <reference types="vite/client" />
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  BookOpenText,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  CircleHelp,
  Clock3,
  FileText,
  Download,
  GitBranch,
  Link2,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const CUSTOMER_ID = 'CUST-BLUEPEAK';

type Ticket = { id: string; summary: string; status: string; created_at: string };
type BugPath = {
  ticket_id: string; bug_id: string; bug_title: string; bug_status: string;
  owner_id: string; owner_name: string;
};
type PromiseItem = {
  id: string; text: string; status: string; due_at: string | null; overdue_days: number;
  made_by: string | null; source_id: string | null; evidence_excerpt?: string | null;
  follow_up_status: string | null; follow_up_open: boolean;
  score: {
    value: number; impact_weight: number; overdue_days_weight: number;
    repetition_weight: number; confidence_weight: number; prior_overdue_promises: number;
  };
};
type Context = {
  customer: { id: string; name: string; segment: string };
  tickets: Ticket[];
  bug_paths: BugPath[];
  promises: Array<Record<string, unknown>>;
  sla_events: Array<{
    case_id: string; ticket_id: string; id: string; kind: string; occurred_at: string;
    target_at: string; contract_id: string; contract_title: string; contract_excerpt: string;
    case_priority?: string;
  }>;
};
type Analysis = {
  as_of: string; case_priority: string; impact_weight: number; open_commitment_count: number;
  overdue_commitment_count: number; unclosed_follow_up_count: number; score_formula: string;
  score_note: string; commitments: PromiseItem[];
};
type ApiAnalysis = { customer: Context['customer']; analysis: Analysis; sla_events: Context['sla_events']; bug_paths: BugPath[] };
type AgentResponse = {
  answer: string; grounded: boolean; tools_used: string[]; citations: string[];
  unsupported_citations: string[]; available_evidence_ids: string[];
};
type ToolProgress = { id: string; name: string; label: string; status: 'running' | 'complete' | 'error' };
type DraftResult = {
  draft: string; internal_evidence: string; internal_note: string; citations: string[];
  tools_used: string[]; grounded: boolean; checks_passed: boolean; warnings: string[];
  send_enabled: false;
};
type SourceDetail = {
  source: { id: string; label: string; title: string; excerpt: string | null; details: Record<string, unknown> };
  relationships: Array<{ from_id: string; type: string; to_id: string }>;
};
type TimelineEvent = {
  when: string; category: 'ticket' | 'commitment' | 'sla'; title: string; detail: string;
  sourceIds: string[]; tone: 'blue' | 'gold' | 'red';
};
type TimelineFilter = 'all' | TimelineEvent['category'];
const FOLLOW_UP_ACTIONS = [
  { id: 'confirm-bug', title: 'Confirm current BUG-77 status with engineering', owner: 'Engineering owner' },
  { id: 'close-prom-22', title: 'Complete the overdue follow-up for PROM-22', owner: 'Account owner' },
  { id: 'close-prom-31', title: 'Complete the overdue follow-up for PROM-31', owner: 'Support owner' },
  { id: 'review-update', title: 'Review the customer update before using it', owner: 'Human review required' },
];

function formatDate(value?: string | null) {
  if (!value) return 'No due date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function humanize(value?: string | null) {
  if (!value) return 'Not recorded';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderInlineMarkdown(text: string, openSource: (id: string) => void): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[A-Za-z0-9_-]+\])/g;
  return text.split(tokenPattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const citation = part.match(/^\[([A-Za-z0-9_-]+)\]$/);
    if (citation) return <button key={index} type="button" className="markdown-citation" onClick={() => openSource(citation[1])}>{citation[1]}</button>;
    return part;
  });
}

function FormattedAnswer({ text, openSource }: { text: string; openSource: (id: string) => void }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = paragraph.map((line) => renderInlineMarkdown(line, openSource)).reduce<ReactNode[]>(
      (all, parts, index) => index ? [...all, <br key={`br-${index}`} />, ...parts] : parts,
      [],
    );
    blocks.push(<p key={`p-${blocks.length}`}>{content}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInlineMarkdown(item, openSource)}</li>)}</ul>);
    list = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const listMatch = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (!line) { flushParagraph(); flushList(); continue; }
    if (listMatch) { flushParagraph(); list.push(listMatch[1]); continue; }
    if (headingMatch) {
      flushParagraph(); flushList();
      blocks.push(<h3 key={`h-${blocks.length}`}>{renderInlineMarkdown(headingMatch[1], openSource)}</h3>);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return <div className="formatted-answer">{blocks}</div>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return response.json() as Promise<T>;
}

async function readSseResponse(
  response: Response,
  onEvent: (eventName: string, payload: Record<string, unknown>) => void,
) {
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.detail || `Request failed (${response.status})`);
  }
  if (!response.body) throw new Error('This browser did not provide a streaming response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    onEvent(eventName, JSON.parse(dataLines.join('\n')) as Record<string, unknown>);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      handleFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) handleFrame(buffer);
}

function App() {
  const [context, setContext] = useState<Context | null>(null);
  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [question, setQuestion] = useState('Why is Bluepeak angry?');
  const [agentResponse, setAgentResponse] = useState<AgentResponse | null>(null);
  const [agentError, setAgentError] = useState('');
  const [asking, setAsking] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const [toolProgress, setToolProgress] = useState<ToolProgress[]>([]);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [draftText, setDraftText] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [graphConnected, setGraphConnected] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [completedActions, setCompletedActions] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('promisegraph:CASE-104:actions') || '[]');
      return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [];
    }
    catch { return []; }
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [newContext, newAnalysis] = await Promise.all([
        getJson<Context>(`/api/customers/${CUSTOMER_ID}/context`),
        getJson<ApiAnalysis>(`/api/customers/${CUSTOMER_ID}/analysis`),
      ]);
      setContext(newContext);
      setAnalysis(newAnalysis);
      setGraphConnected(true);
      setRefreshedAt(new Date());
    } catch (caught) {
      setGraphConnected(false);
      setError(caught instanceof Error ? caught.message : 'Could not reach the PromiseGraph API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    try { localStorage.setItem('promisegraph:CASE-104:actions', JSON.stringify(completedActions)); }
    catch { /* Checklist still works for this session when storage is unavailable. */ }
  }, [completedActions]);

  async function openSource(sourceId: string) {
    setSourceOpen(true);
    setSourceLoading(true);
    setSourceError('');
    setSourceDetail(null);
    try {
      const detail = await getJson<SourceDetail>(`/api/customers/${CUSTOMER_ID}/sources/${encodeURIComponent(sourceId)}`);
      setSourceDetail(detail);
    } catch (caught) {
      setSourceError(caught instanceof Error ? caught.message : 'Could not load that source record.');
    } finally {
      setSourceLoading(false);
    }
  }

  function closeSource() {
    setSourceOpen(false);
    setSourceError('');
  }

  function handleProgressEvent(eventName: string, payload: Record<string, unknown>) {
    if (eventName === 'progress') setLiveStatus(String(payload.message || 'Investigating the case…'));
    if (eventName === 'tool_start') {
      const item = payload as unknown as ToolProgress;
      setToolProgress((previous) => [...previous, { ...item, status: 'running' }]);
      setLiveStatus(item.label || `Calling ${item.name.replaceAll('_', ' ')}…`);
    }
    if (eventName === 'tool_finish') {
      const item = payload as unknown as ToolProgress;
      setToolProgress((previous) => previous.map((tool) => tool.id === item.id
        ? { ...tool, status: item.status === 'error' ? 'error' : 'complete' }
        : tool));
      setLiveStatus(`${item.label || item.name.replaceAll('_', ' ')} complete`);
    }
    if (eventName === 'error') throw new Error(String(payload.message || 'Agent stream failed.'));
  }

  async function askAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    setAgentError('');
    setAgentResponse(null);
    setLiveStatus('Connecting to the agent…');
    setToolProgress([]);
    try {
      const response = await fetch(`${API_BASE}/api/customers/${CUSTOMER_ID}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      await readSseResponse(response, (eventName, payload) => {
        handleProgressEvent(eventName, payload);
        if (eventName === 'answer') setAgentResponse(payload as unknown as AgentResponse);
      });
      setLiveStatus('Investigation complete');
    } catch (caught) {
      setAgentError(caught instanceof Error ? caught.message : 'The agent request failed.');
    } finally {
      setAsking(false);
    }
  }

  async function prepareDraft() {
    if (asking) return;
    setAsking(true);
    setAgentError('');
    setDraftResult(null);
    setDraftText('');
    setCopyMessage('');
    setLiveStatus('Preparing an evidence-backed draft…');
    setToolProgress([]);
    try {
      const response = await fetch(`${API_BASE}/api/customers/${CUSTOMER_ID}/draft-reply/stream`, { method: 'POST' });
      await readSseResponse(response, (eventName, payload) => {
        handleProgressEvent(eventName, payload);
        if (eventName === 'draft') {
          const result = payload as unknown as DraftResult;
          setDraftResult(result);
          setDraftText(result.draft);
        }
      });
      setLiveStatus('Draft prepared for human review');
    } catch (caught) {
      setAgentError(caught instanceof Error ? caught.message : 'Draft generation failed.');
    } finally {
      setAsking(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopyMessage('Copied to clipboard');
    } catch {
      setCopyMessage('Clipboard unavailable; select and copy the draft manually.');
    }
  }

  function editDraft(value: string) {
    setDraftText(value);
    setDraftResult((previous) => previous ? {
      ...previous,
      checks_passed: false,
      warnings: [...new Set([...previous.warnings, 'Draft edited locally; review the edited wording before use.'])],
    } : previous);
  }

  function toggleAction(actionId: string) {
    setCompletedActions((previous) => previous.includes(actionId)
      ? previous.filter((id) => id !== actionId)
      : [...previous, actionId]);
  }

  function exportCaseBrief() {
    const customerName = context?.customer.name || 'Bluepeak Robotics';
    const lines = [
      `# ${customerName} — escalation handoff`,
      '',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '## Situation',
      diagnosis,
      '',
      '## Current facts',
      ...ledger.map((item) => `- ${item.text} **${humanize(item.status)}**; due ${formatDate(item.due_at)}; owner ${item.made_by || 'not recorded'} [${item.id}]${item.source_id ? ` [${item.source_id}]` : ''}. Follow-up: ${humanize(item.follow_up_status)}.`),
      ...((context?.bug_paths ?? []).slice(0, 1).map((bug) => `- ${bug.bug_id} remains **${humanize(bug.bug_status)}**; current owner ${bug.owner_name} [${bug.bug_id}] [${bug.owner_id}].`)),
      ...(context?.sla_events ?? []).map((event) => `- ${humanize(event.kind)} on ${event.ticket_id} at ${formatDate(event.occurred_at)}; target ${formatDate(event.target_at)} [${event.id}] [${event.contract_id}].`),
      '',
      '## Known uncertainty',
      '- No source currently confirms a fix delivery date or current engineering ETA.',
      '',
      '## Recommended next steps',
      '- Confirm BUG-77 status with engineering before offering a new customer date.',
      '- Complete the overdue customer follow-ups for PROM-22 and PROM-31.',
      '- Have a human review any customer-facing update; this app does not send it.',
      '',
      '## Timeline',
      ...timeline.map((event) => `- ${formatDate(event.when)} — ${event.title}: ${event.detail} ${event.sourceIds.map((id) => `[${id}]`).join(' ')}`),
      '',
      '_Generated from the synthetic PromiseGraph demo. Verify current records before acting._',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${CUSTOMER_ID.toLowerCase()}-case-brief.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const ledger = analysis?.analysis.commitments ?? [];
  const overdueCount = analysis?.analysis.overdue_commitment_count ?? 0;
  const slaCount = context?.sla_events.length ?? 0;
  const leadingBug = context?.bug_paths[0];
  const topScore = ledger[0]?.score.value ?? 0;
  const duePromiseCount = useMemo(() => ledger.filter((item) => item.status === 'overdue').length, [ledger]);
  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    for (const ticket of context?.tickets ?? []) {
      if (ticket.created_at) events.push({
        when: ticket.created_at, category: 'ticket', tone: 'blue',
        title: `Support ticket opened · ${ticket.id}`, detail: ticket.summary,
        sourceIds: [ticket.id],
      });
    }
    for (const promise of ledger) {
      if (promise.due_at) events.push({
        when: promise.due_at, category: 'commitment', tone: 'gold',
        title: `${promise.status === 'overdue' ? 'Commitment became overdue' : 'Commitment due'} · ${promise.id}`,
        detail: `${promise.text}${promise.made_by ? ` Made by ${promise.made_by}.` : ''}${promise.follow_up_status ? ` Follow-up: ${humanize(promise.follow_up_status)}.` : ''}`,
        sourceIds: [promise.id, ...(promise.source_id ? [promise.source_id] : [])],
      });
    }
    for (const event of context?.sla_events ?? []) {
      if (event.occurred_at) events.push({
        when: event.occurred_at, category: 'sla', tone: 'red',
        title: `SLA event · ${humanize(event.kind)}`,
        detail: `Target was ${formatDate(event.target_at)}. Contract: ${event.contract_title}.`,
        sourceIds: [event.id, event.contract_id, event.ticket_id].filter(Boolean),
      });
    }
    return events.filter((item) => Number.isFinite(Date.parse(item.when)))
      .sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  }, [context, ledger]);
  const visibleTimeline = useMemo(() => {
    const query = timelineSearch.trim().toLowerCase();
    return timeline.filter((event) => (timelineFilter === 'all' || event.category === timelineFilter)
      && (!query || `${event.title} ${event.detail} ${event.sourceIds.join(' ')}`.toLowerCase().includes(query)));
  }, [timeline, timelineFilter, timelineSearch]);

  const diagnosis = context && analysis
    ? `${context.customer.name} has ${context.tickets.length} connected support tickets. ${duePromiseCount} customer-facing ${duePromiseCount === 1 ? 'commitment is' : 'commitments are'} overdue${leadingBug ? ` around ${leadingBug.bug_title.toLowerCase()}` : ''}${slaCount ? ', and the latest escalation includes an SLA breach' : ''}. The graph links these records to their owners and evidence.`
    : 'Loading evidence from the connected customer graph.';

  const recommended = leadingBug
    ? `Ask ${leadingBug.owner_name} for a confirmed engineering checkpoint, then have the account owner update the customer. Do not commit to a new delivery date until engineering confirms it.`
    : 'Review the open promises and assign a clear owner for the customer follow-up.';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><GitBranch size={19} /></span><span>promise<span className="brand-light">graph</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-picker"><span className="workspace-avatar">PG</span><span className="workspace-name">Support Operations<small>Demo workspace</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">INTELLIGENCE</div>
        <nav className="nav-list">
          <a href="#case-top" title="Escalation desk" className="nav-item active"><Activity size={17} /><span className="nav-item-label">Escalation desk</span><span className="nav-count">1</span></a>
          <a href="#evidence-path" title="Customer graph" className="nav-item muted"><Boxes size={17} /><span className="nav-item-label">Customer graph</span></a>
          <a href="#promise-ledger" title="Promise ledger" className="nav-item muted"><BookOpenText size={17} /><span className="nav-item-label">Promise ledger</span></a>
          <a href="#action-checklist" title="Follow-up checklist" className="nav-item muted"><ClipboardCheck size={17} /><span className="nav-item-label">Next steps</span></a>
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">ACTIVE CASE</div>
        <div className="case-mini"><span className="case-dot" /><span><b>CASE-104</b><small>Bluepeak Robotics</small></span></div>
        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <div className={`graph-status ${graphConnected ? 'connected' : 'disconnected'}`}><span className="status-pulse" /><span>{loading ? 'Checking graph…' : graphConnected ? 'Graph connected' : 'Graph unavailable'}</span><span className="graph-status-label">FALKORDB</span></div>
          <div className="profile"><span className="profile-avatar">CS</span><span><b>Chirag Sharma</b><small>Project owner</small></span><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Escalation desk</span><ArrowRight size={14} /><b>CASE-104</b></div>
          <div className="topbar-right">
            <span className="demo-pill"><span /> SYNTHETIC DEMO DATA</span>
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <button className="icon-button" aria-label="Notifications"><BellRing size={17} /></button>
          </div>
        </header>

        <div className="content">
          {error && <div className="error-banner"><AlertCircle size={18} /><div><b>Could not load the case graph</b><span>{error}</span><small>Check that FalkorDB and the FastAPI server are running on this PC.</small></div><button onClick={() => void loadData()} className="retry-button"><RefreshCw size={14} /> Retry</button></div>}

          <section className="case-heading" id="case-top">
            <div>
              <div className="eyebrow"><span className="critical-dot" /> CRITICAL ESCALATION <span className="eyebrow-sep">/</span> OPEN CASE</div>
              <h1>Bluepeak Robotics</h1>
              <p className="subtitle">Why is this account escalating—and what needs to happen next?</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" onClick={() => void loadData()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh graph</button>
              <button className="secondary-button" onClick={exportCaseBrief} disabled={!context}><Download size={15} /> Export brief</button>
              <button className="primary-button" onClick={() => void prepareDraft()} disabled={asking || loading} title="Generate an editable draft only; nothing will be sent"><Sparkles size={15} /> {asking ? 'Preparing…' : 'Prepare response'} <span className="soon-tag">DRAFT ONLY</span></button>
            </div>
          </section>

          <section className="metrics-grid">
            <div className="metric-card"><div className="metric-top"><span className="metric-label">COMMITMENT DEBT</span><span className="metric-icon gold"><Target size={17} /></span></div><div className="metric-value">{loading ? '—' : topScore.toFixed(2)}<span className="metric-unit"> pts</span></div><div className="metric-foot"><ArrowUpRight size={14} className="gold-text" /> Highest unresolved promise score</div></div>
            <div className="metric-card"><div className="metric-top"><span className="metric-label">OVERDUE PROMISES</span><span className="metric-icon red"><Clock3 size={17} /></span></div><div className="metric-value">{loading ? '—' : overdueCount}<span className="metric-unit"> / {analysis?.analysis.open_commitment_count ?? 0}</span></div><div className="metric-foot"><span className="red-text">Needs a closed-loop follow-up</span></div></div>
            <div className="metric-card"><div className="metric-top"><span className="metric-label">SLA EVENTS</span><span className="metric-icon blue"><ShieldAlert size={17} /></span></div><div className="metric-value">{loading ? '—' : slaCount}<span className="metric-unit"> breach</span></div><div className="metric-foot">Contract evidence attached</div></div>
            <div className="metric-card"><div className="metric-top"><span className="metric-label">RELATED HISTORY</span><span className="metric-icon green"><Link2 size={17} /></span></div><div className="metric-value">{loading ? '—' : context?.tickets.length ?? 0}<span className="metric-unit"> tickets</span></div><div className="metric-foot">Linked across customer history</div></div>
          </section>

          <section className="diagnosis-card">
            <div className="diagnosis-icon"><Sparkles size={17} /></div>
            <div className="diagnosis-copy"><div className="section-kicker">GRAPH-GROUNDED READOUT <span className="live-tag"><span /> LIVE</span></div><h2>Repeated issue. Missed commitments. No closed loop.</h2><p>{diagnosis}</p></div>
            <div className="diagnosis-meta"><div className="confidence-label"><BadgeCheck size={15} /> SOURCE-BACKED</div><span>Based on connected records</span></div>
          </section>

          <section className="timeline-panel panel" aria-label="Chronological case timeline">
            <div className="panel-heading"><div><div className="section-kicker">CASE HISTORY · CHRONOLOGICAL</div><h2>How the escalation unfolded</h2></div><span className="source-count">{visibleTimeline.length} / {timeline.length} events</span></div>
            <div className="timeline-controls"><label className="timeline-search"><Search size={14} /><input value={timelineSearch} onChange={(event) => setTimelineSearch(event.target.value)} aria-label="Search timeline" placeholder="Search events or record IDs" /></label><select value={timelineFilter} onChange={(event) => setTimelineFilter(event.target.value as TimelineFilter)} aria-label="Filter timeline event type"><option value="all">All event types</option><option value="ticket">Tickets</option><option value="commitment">Commitments</option><option value="sla">SLA events</option></select></div>
            {timeline.length ? visibleTimeline.length ? <ol className="case-timeline">{visibleTimeline.map((item, index) => <li className="timeline-item" key={`${item.category}-${item.sourceIds[0]}-${item.when}-${index}`}>
              <span className={`timeline-marker ${item.tone}`}>{item.category === 'ticket' ? <FileText size={13} /> : item.category === 'commitment' ? <Clock3 size={13} /> : <ShieldAlert size={13} />}</span>
              <div className="timeline-content"><div className="timeline-title-row"><b>{item.title}</b><time dateTime={item.when}>{formatDate(item.when)}</time></div><p>{item.detail}</p><div className="timeline-sources">{item.sourceIds.map((id) => <button className="citation-chip source-link" type="button" key={id} onClick={() => void openSource(id)}>{id}</button>)}</div></div>
            </li>)}</ol> : <div className="timeline-empty">No timeline events match these filters.</div> : <div className="timeline-empty">Timeline events will appear when the graph data loads.</div>}
          </section>

          <section className="action-checklist panel" id="action-checklist">
            <div className="panel-heading"><div><div className="section-kicker">CLOSED-LOOP FOLLOW-UP</div><h2>Operator checklist</h2></div><span className="source-count">{completedActions.length} / {FOLLOW_UP_ACTIONS.length} done</span></div>
            <p className="checklist-note">Track the safe next steps for this case. These checkmarks are saved in this browser only; they do not update FalkorDB or contact anyone.</p>
            <div className="checklist-items">{FOLLOW_UP_ACTIONS.map((item) => {
              const checked = completedActions.includes(item.id);
              return <label className={`checklist-item ${checked ? 'checked' : ''}`} key={item.id}><input type="checkbox" checked={checked} onChange={() => toggleAction(item.id)} /><span className="checklist-check"><Check size={13} /></span><span className="checklist-copy"><b>{item.title}</b><small>{item.owner}</small></span></label>;
            })}</div>
            <div className="checklist-foot"><ShieldAlert size={13} /> Confirm current engineering status and complete customer follow-ups outside this prototype, then record the outcome in your source system.</div>
          </section>

          <section className="agent-panel panel">
            <div className="panel-heading"><div><div className="section-kicker">LANGGRAPH · TOOL-CALLING INVESTIGATION</div><h2>Ask the case agent</h2></div><span className="agent-mark"><Bot size={17} /></span></div>
            <p className="agent-intro">The agent must retrieve customer context and the Promise Ledger through read-only tools before answering.</p>
            <form className="agent-form" onSubmit={askAgent}>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={2} aria-label="Question for the case agent" placeholder="Ask about the connected case evidence…" />
              <button type="submit" disabled={asking || !question.trim()}><SendHorizontal size={14} /> {asking ? 'Investigating…' : 'Ask graph agent'}</button>
            </form>
            <div className="prompt-suggestions"><span>TRY</span>{['Why is Bluepeak escalating?', 'What is known—and still uncertain?', 'What should the team do next?'].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div>
            {agentError && <div className="agent-error"><AlertCircle size={14} />{agentError}</div>}
            {(asking || toolProgress.length > 0) && <div className="tool-trace" aria-live="polite">
              {asking && <div className="agent-loading"><LoaderCircle className="spin" size={15} /> {liveStatus || 'Investigating the case…'}</div>}
              {toolProgress.map((tool) => <div className="tool-progress-row" key={tool.id}>
                <span className={`tool-state-icon ${tool.status}`}>{tool.status === 'running' ? <LoaderCircle className="spin" size={13} /> : tool.status === 'complete' ? <Check size={13} /> : <AlertCircle size={13} />}</span>
                <span>{tool.label || tool.name.replaceAll('_', ' ')}</span>
                <b>{tool.status === 'running' ? 'RUNNING' : tool.status === 'complete' ? 'DONE' : 'ERROR'}</b>
              </div>)}
            </div>}
            {agentResponse && <div className={`agent-answer ${agentResponse.grounded ? 'verified' : 'unverified'}`}>
              <div className="answer-heading"><span>{agentResponse.grounded ? <BadgeCheck size={15} /> : <AlertCircle size={15} />}{agentResponse.grounded ? 'EVIDENCE CHECK PASSED' : 'EVIDENCE NEEDS REVIEW'}</span><div>{agentResponse.tools_used.map((name) => <span className="tool-chip" key={name}>{name.replaceAll('_', ' ')}</span>)}</div></div>
              <FormattedAnswer text={agentResponse.answer} openSource={(id) => void openSource(id)} />
              {agentResponse.citations.length > 0 && <div className="citation-row"><span>VERIFIED SOURCES</span>{agentResponse.citations.map((id) => <button className="citation-chip source-link" type="button" key={id} onClick={() => void openSource(id)}>{id}</button>)}</div>}
              {agentResponse.unsupported_citations.length > 0 && <div className="unsupported-row">Unverified IDs: {agentResponse.unsupported_citations.join(', ')}</div>}
              <div className="answer-foot">Tool calls are read-only. Any customer-facing action still requires human review.</div>
            </div>}
          </section>

          {draftResult && <section className={`draft-panel panel ${draftResult.checks_passed ? 'checks-passed' : 'needs-review'}`}>
            <div className="panel-heading"><div><div className="section-kicker">CUSTOMER UPDATE · DRAFT ONLY</div><h2>Review before using</h2></div><span className={`draft-check-badge ${draftResult.checks_passed ? 'ok' : 'warn'}`}>{draftResult.checks_passed ? <BadgeCheck size={14} /> : <AlertCircle size={14} />}{draftResult.checks_passed ? 'Safety checks passed' : 'Review required'}</span></div>
            <div className="draft-only-notice"><ShieldAlert size={14} /><span>This is an editable local draft. It has <b>not</b> been sent or saved to a ticket.</span></div>
            <textarea className="draft-editor" value={draftText} onChange={(event) => editDraft(event.target.value)} rows={7} aria-label="Editable customer update draft" />
            <div className="draft-actions"><button className="secondary-button" onClick={() => void copyDraft()}><FileText size={14} /> Copy draft</button><button className="secondary-button" onClick={() => void prepareDraft()} disabled={asking}><RefreshCw size={14} className={asking ? 'spin' : ''} /> Regenerate</button><span>{copyMessage}</span></div>
            {draftResult.citations.length > 0 && <div className="draft-evidence"><b>INTERNAL EVIDENCE — not part of the customer message</b><div>{draftResult.citations.map((id) => <button className="citation-chip source-link" type="button" key={id} onClick={() => void openSource(id)}>{id}</button>)}</div></div>}
            {draftResult.internal_note && <div className="draft-internal-note"><b>Internal note</b><p>{draftResult.internal_note}</p></div>}
            {draftResult.warnings.length > 0 && <ul className="draft-warnings">{draftResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </section>}

          <div className="section-heading" id="promise-ledger"><div><div className="section-kicker">PROMISE LEDGER</div><h2>Commitments that need attention</h2></div><div className="as-of">As of {analysis ? formatDate(analysis.analysis.as_of) : '—'}</div></div>
          <section className="ledger-list">
            {ledger.map((item, index) => (
              <article className="promise-card" key={item.id}>
                <div className="promise-rank">{String(index + 1).padStart(2, '0')}</div>
                <div className="promise-main">
                  <div className="promise-title-row"><h3>{item.text}</h3><span className={`status-pill ${item.status}`}>{item.status === 'overdue' ? <Clock3 size={12} /> : <Check size={12} />}{humanize(item.status)}</span></div>
                  <div className="promise-meta"><span><UserRound size={13} /> {item.made_by || 'Owner not recorded'}</span><span><CalendarClock size={13} /> Due {formatDate(item.due_at)}</span><span><FileText size={13} /> Source {item.source_id ? <button type="button" className="inline-source-link" onClick={() => void openSource(item.source_id!)}>{item.source_id}</button> : <b>not linked</b>}</span></div>
                  {item.evidence_excerpt && <blockquote>“{item.evidence_excerpt}”</blockquote>}
                  <div className="followup-row"><span className={item.follow_up_open ? 'followup-open' : 'followup-closed'}>{item.follow_up_open ? <AlertCircle size={13} /> : <BadgeCheck size={13} />} Follow-up: {humanize(item.follow_up_status)}</span><span>{item.overdue_days.toFixed(1)} days overdue</span></div>
                </div>
                <div className="score-panel"><span className="score-label">DEBT SCORE</span><strong>{item.score.value.toFixed(2)}</strong><div className="score-bar"><i style={{ width: `${Math.max(5, Math.min(100, item.score.value / 9 * 100))}%` }} /></div><span className="score-breakdown">Impact {item.score.impact_weight.toFixed(1)} · Age {item.score.overdue_days_weight.toFixed(2)} · Repeat {item.score.repetition_weight.toFixed(2)} · Confidence {item.score.confidence_weight.toFixed(2)}</span></div>
              </article>
            ))}
            {!loading && !error && ledger.length === 0 && <div className="empty-state"><BadgeCheck size={20} /><span>No promise records found for this customer.</span></div>}
            {loading && <div className="loading-state"><LoaderCircle className="spin" size={18} /> Loading commitments from the graph…</div>}
          </section>

          <div className="two-column">
            <section className="panel evidence-panel" id="evidence-path">
              <div className="panel-heading"><div><div className="section-kicker">MULTI-HOP REASONING</div><h2>Connected evidence path</h2></div><GitBranch size={18} /></div>
              <div className="path-flow">
                <div className="path-node customer-node"><span className="path-icon"><BriefcaseBusiness size={15} /></span><div><small>CUSTOMER</small><b>{context?.customer.name ?? 'Bluepeak Robotics'}</b></div></div><div className="path-connector"><span /><ArrowDownRight size={14} /></div>
                <div className="path-node"><span className="path-icon"><FileText size={15} /></span><div><small>REPEAT SUPPORT HISTORY</small><b>{context?.tickets.length ?? '—'} related tickets</b><em>{context?.tickets.map((t) => <button type="button" className="inline-source-link" key={t.id} onClick={() => void openSource(t.id)}>{t.id}</button>) || 'Waiting for API'}</em></div></div><div className="path-connector"><span /><ArrowDownRight size={14} /></div>
                <div className="path-node"><span className="path-icon bug-icon"><Boxes size={15} /></span><div><small>SHARED PRODUCT ISSUE</small><b>{leadingBug ? <button type="button" className="inline-source-link" onClick={() => void openSource(leadingBug.bug_id)}>{leadingBug.bug_id}</button> : 'Bug not linked'}</b><em>{leadingBug?.bug_title ?? 'No connected bug evidence'}</em></div></div><div className="path-connector"><span /><ArrowDownRight size={14} /></div>
                <div className="path-node owner-node"><span className="path-icon owner-icon"><UsersRound size={15} /></span><div><small>CURRENT ENGINEERING OWNER</small><b>{leadingBug?.owner_name ?? 'Not recorded'}</b><em>{leadingBug?.owner_id ? <button type="button" className="inline-source-link" onClick={() => void openSource(leadingBug.owner_id)}>{leadingBug.owner_id}</button> : ''}</em></div></div>
              </div>
            </section>

            <section className="panel action-panel">
              <div className="panel-heading"><div><div className="section-kicker">HUMAN-APPROVED NEXT STEP</div><h2>Break the loop</h2></div><div className="recommend-icon"><ArrowUpRight size={17} /></div></div>
              <p className="action-text">{recommended}</p>
              <div className="action-assignees"><div className="assignee"><span className="assignee-avatar violet">{leadingBug?.owner_name?.split(' ').map((part) => part[0]).join('') ?? 'EN'}</span><div><small>ENGINEERING CHECKPOINT</small><b>{leadingBug?.owner_name ?? 'Engineering owner'}</b></div></div><ArrowRight size={15} className="assignee-arrow" /><div className="assignee"><span className="assignee-avatar teal"><UserRound size={15} /></span><div><small>CUSTOMER UPDATE</small><b>Account owner</b></div></div></div>
              <div className="action-note"><ShieldAlert size={14} /> No delivery date is suggested; confirm one with engineering first.</div>
              <button className="draft-disabled" onClick={() => void prepareDraft()} disabled={asking || loading}><Sparkles size={14} /> Prepare customer update <span>DRAFT ONLY</span></button>
            </section>
          </div>

          <section className="sources-panel panel">
            <div className="panel-heading"><div><div className="section-kicker">PROVENANCE</div><h2>Evidence sources</h2></div><span className="source-count">{(context?.tickets.length ?? 0) + (context?.sla_events.length ?? 0) + ledger.length} linked records</span></div>
            <div className="source-list">
              {context?.sla_events.map((event) => <div className="source-item" key={event.id}><span className="source-type red-source"><ShieldAlert size={14} /></span><div><b><button type="button" className="source-title-link" onClick={() => void openSource(event.id)}>{event.contract_title || event.id}</button></b><small>{event.kind.replaceAll('_', ' ')} · target {formatDate(event.target_at)} · <button type="button" className="inline-source-link" onClick={() => void openSource(event.contract_id)}>{event.contract_id}</button></small></div><span className="source-tag">CONTRACT + SLA</span></div>)}
              {context?.bug_paths.slice(0, 1).map((bug) => <div className="source-item" key={bug.bug_id}><span className="source-type blue-source"><Boxes size={14} /></span><div><b><button type="button" className="source-title-link" onClick={() => void openSource(bug.bug_id)}>{bug.bug_id} · {bug.bug_title}</button></b><small>{humanize(bug.bug_status)} · Owner: {bug.owner_name}</small></div><span className="source-tag">ENGINEERING</span></div>)}
              {ledger.map((item) => <div className="source-item" key={item.id}><span className="source-type gold-source"><FileText size={14} /></span><div><b><button type="button" className="source-title-link" onClick={() => void openSource(item.source_id || item.id)}>{item.source_id || item.id} · {item.text}</button></b><small>{item.evidence_excerpt || 'Promise record linked to the customer graph.'}</small></div><span className="source-tag">PROMISE EVIDENCE</span></div>)}
              {!loading && !context?.sla_events.length && !ledger.length && <div className="empty-state">No linked evidence returned.</div>}
            </div>
          </section>

          <footer className="page-footer"><span><Workflow size={14} /> PromiseGraph · Graph context shapes every finding</span><span>{refreshedAt ? `Last refreshed ${refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for graph connection'} <button onClick={() => void loadData()} aria-label="Refresh data"><RefreshCw size={13} /></button></span></footer>
        </div>
      </main>
      {sourceOpen && <div className="source-overlay" role="presentation" onClick={closeSource}>
        <aside className="source-drawer" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title" onClick={(event) => event.stopPropagation()}>
          <div className="source-drawer-header"><div><div className="section-kicker">READ-ONLY SOURCE RECORD</div><h2 id="source-drawer-title">{sourceDetail?.source.id || (sourceLoading ? 'Loading source…' : 'Source detail')}</h2></div><button type="button" className="source-close" aria-label="Close source detail" onClick={closeSource}><X size={18} /></button></div>
          {sourceLoading && <div className="source-drawer-state"><LoaderCircle className="spin" size={17} /> Loading this customer-linked record…</div>}
          {sourceError && <div className="source-drawer-error"><AlertCircle size={15} />{sourceError}</div>}
          {sourceDetail && <div className="source-drawer-body">
            <div className="source-type-line"><span>{sourceDetail.source.label}</span>{sourceDetail.source.title}</div>
            {sourceDetail.source.excerpt && <blockquote className="source-quote">“{sourceDetail.source.excerpt}”</blockquote>}
            <div className="source-detail-grid">{Object.entries(sourceDetail.source.details).map(([key, value]) => <div className="source-detail-field" key={key}><small>{humanize(key)}</small><span>{key.endsWith('_at') && typeof value === 'string' ? formatDate(value) : String(value)}</span></div>)}</div>
            <div className="source-edges"><div className="section-kicker">CONNECTED GRAPH PROVENANCE</div>
              {sourceDetail.relationships.length ? sourceDetail.relationships.map((edge, index) => {
                const adjacentId = edge.from_id === sourceDetail.source.id ? edge.to_id : edge.from_id;
                return <div className="source-edge" key={`${edge.from_id}-${edge.type}-${edge.to_id}-${index}`}><button type="button" onClick={() => void openSource(edge.from_id)}>{edge.from_id}</button><span>—[:{edge.type}]→</span><button type="button" onClick={() => void openSource(edge.to_id)}>{edge.to_id}</button><button type="button" className="edge-open" aria-label={`Open ${adjacentId}`} onClick={() => void openSource(adjacentId)}><ArrowRight size={13} /></button></div>;
              }) : <p className="source-drawer-state">No connected provenance edges were returned for this record.</p>}
            </div>
            {typeof sourceDetail.source.details.source_ref === 'string' && <div className="source-ref"><small>Source reference</small><code>{sourceDetail.source.details.source_ref}</code></div>}
          </div>}
          <div className="source-drawer-foot"><ShieldAlert size={13} /> Customer-scoped, read-only graph lookup. No records are modified.</div>
        </aside>
      </div>}
    </div>
  );
}

export default App;
