import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  RefreshCw,
  Search,
  Users,
  Video,
} from 'lucide-react';
import {
  ConferenceRecord,
  formatDuration,
  formatTimeOnly,
  formatTimestamp,
  getParticipantDisplayName,
  MeetParticipant,
  MeetRecording,
  MeetTranscript,
  TranscriptEntry,
} from '../lib/meetApi';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ConferenceArtifacts {
  participants: MeetParticipant[];
  recordings: MeetRecording[];
  transcripts: MeetTranscript[];
  entriesByTranscript: Record<string, TranscriptEntry[]>;
}

interface ConferenceHistoryViewProps {
  isAuthenticated: boolean;
  isLoadingRecords: boolean;
  records: ConferenceRecord[];
  selectedRecord: ConferenceRecord | null;
  artifacts: ConferenceArtifacts | null;
  isLoadingArtifacts: boolean;
  apiError: string | null;
  onRefreshRecords: () => Promise<void>;
  onSelectRecord: (record: ConferenceRecord) => Promise<void>;
  onCreateInstantSpace: () => Promise<void>;
  onSignIn: () => void;
}

type StatusFilter = 'all' | 'active' | 'ended';
type ArtifactTab = 'transcript' | 'participants' | 'recordings';

export const ConferenceHistoryView: React.FC<ConferenceHistoryViewProps> = ({
  isAuthenticated,
  isLoadingRecords,
  records,
  selectedRecord,
  artifacts,
  isLoadingArtifacts,
  apiError,
  onRefreshRecords,
  onSelectRecord,
  onCreateInstantSpace,
  onSignIn,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('transcript');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const isActive = !rec.endTime;
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'ended' && isActive) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        rec.name.toLowerCase().includes(q) ||
        (rec.space || '').toLowerCase().includes(q) ||
        formatTimestamp(rec.startTime).toLowerCase().includes(q)
      );
    });
  }, [records, searchQuery, statusFilter]);

  const participantLookup = useMemo(() => {
    const map: Record<string, string> = {};
    if (!artifacts?.participants) return map;
    for (const p of artifacts.participants) {
      map[p.name] = getParticipantDisplayName(p);
    }
    return map;
  }, [artifacts]);

  const activeTranscript = artifacts?.transcripts?.[0] || null;
  const transcriptEntries = useMemo(() => {
    if (!activeTranscript || !artifacts) return [];
    const raw = artifacts.entriesByTranscript[activeTranscript.name] || [];
    if (!transcriptSearch.trim()) return raw;
    const q = transcriptSearch.toLowerCase();
    return raw.filter((entry) => {
      const speaker = participantLookup[entry.participant] || 'Speaker';
      return (
        entry.text.toLowerCase().includes(q) || speaker.toLowerCase().includes(q)
      );
    });
  }, [activeTranscript, artifacts, participantLookup, transcriptSearch]);

  const formatMarkdownTranscript = () => {
    if (!selectedRecord || transcriptEntries.length === 0) return '';
    const lines = [
      `# Google Meet Transcript`,
      `- Conference: ${selectedRecord.name}`,
      `- Started: ${formatTimestamp(selectedRecord.startTime)}`,
      `- Duration: ${formatDuration(selectedRecord.startTime, selectedRecord.endTime)}`,
      ``,
    ];
    for (const entry of transcriptEntries) {
      const speaker = participantLookup[entry.participant] || 'Participant';
      lines.push(`**${speaker}** (${formatTimeOnly(entry.startTime)}): ${entry.text}`);
      lines.push('');
    }
    return lines.join('\n');
  };

  const handleCopyTranscript = async () => {
    const md = formatMarkdownTranscript();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopiedTranscript(true);
      window.setTimeout(() => setCopiedTranscript(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadTranscript = () => {
    const md = formatMarkdownTranscript();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meet-transcript-${selectedRecord?.name.split('/').pop() || 'session'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] p-8 sm:p-12 text-center max-w-xl mx-auto my-8 space-y-5">
        <div className="mx-auto h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <FileText className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Connect Google Meet to View Conference History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Sign in with your Google account to browse past conference records, participant attendance, recordings, and searchable speaker transcripts.
          </p>
        </div>
        <div className="pt-1 flex justify-center">
          <GoogleSignInButton onClick={onSignIn} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
            Conference History & Transcripts
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Browse real Google Meet conference records, participant logs, Drive recordings, and searchable transcripts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter conferences..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['all', 'active', 'ended'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === f
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRefreshRecords}
            disabled={isLoadingRecords}
            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRecords ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {apiError}
        </div>
      )}

      {/* Split View: Records Table (Left 5 cols) + Artifacts Inspector (Right 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Conference Records List */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
            <span>Conference Sessions</span>
            <span className="font-mono tabular-nums">{filteredRecords.length} shown</span>
          </div>

          {isLoadingRecords ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5 space-y-2 animate-pulse">
                  <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800/60" />
                </div>
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="mx-auto h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <Clock className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No conference records found
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Completed or active Google Meet calls hosted by your account will appear here.
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateInstantSpace}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                <Video className="h-3.5 w-3.5" />
                Start First Meeting
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[560px] overflow-y-auto">
              {filteredRecords.map((rec) => {
                const isSelected = selectedRecord?.name === rec.name;
                const isActive = !rec.endTime;
                const recordSlug = rec.name.split('/').pop() || rec.name;
                return (
                  <button
                    key={rec.name}
                    type="button"
                    onClick={() => onSelectRecord(rec)}
                    className={`w-full text-left px-4 py-3.5 transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {formatTimestamp(rec.startTime)}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            isActive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {isActive ? 'Live' : 'Ended'}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {rec.space || recordSlug}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatDuration(rec.startTime, rec.endTime)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Artifacts Inspector */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] overflow-hidden">
          {!selectedRecord ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Select a conference record
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect participant attendance, Drive recordings, and full speaker transcripts.
              </p>
            </div>
          ) : (
            <div>
              {/* Inspector Header */}
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Session: {formatTimestamp(selectedRecord.startTime)}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {selectedRecord.name} · Duration{' '}
                    <span className="tabular-nums">
                      {formatDuration(selectedRecord.startTime, selectedRecord.endTime)}
                    </span>
                  </p>
                </div>

                {/* Artifact Sub-tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setArtifactTab('transcript')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      artifactTab === 'transcript'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Transcript ({artifacts?.transcripts.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtifactTab('participants')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      artifactTab === 'participants'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Participants ({artifacts?.participants.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtifactTab('recordings')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      artifactTab === 'recordings'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Recordings ({artifacts?.recordings.length ?? 0})
                  </button>
                </div>
              </div>

              {/* Inspector Content */}
              {isLoadingArtifacts ? (
                <div className="p-6 space-y-3 animate-pulse">
                  <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-16 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
                  <div className="h-16 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
                </div>
              ) : (
                <div className="p-5">
                  {artifactTab === 'transcript' && (
                    <div className="space-y-4">
                      {!activeTranscript ? (
                        <div className="py-8 text-center space-y-1.5">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            No transcript generated for this call
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            When transcription is enabled during a Meet call, speaker entries appear here.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <input
                                type="text"
                                value={transcriptSearch}
                                onChange={(e) => setTranscriptSearch(e.target.value)}
                                placeholder="Search transcript text or speaker..."
                                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              {activeTranscript.docsDestination?.exportUri && (
                                <a
                                  href={activeTranscript.docsDestination.exportUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                                >
                                  Google Doc
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={handleCopyTranscript}
                                disabled={transcriptEntries.length === 0}
                                className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                              >
                                {copiedTranscript ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                                {copiedTranscript ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadTranscript}
                                disabled={transcriptEntries.length === 0}
                                className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Export .md
                              </button>
                            </div>
                          </div>

                          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[400px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                            {transcriptEntries.length === 0 ? (
                              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                                No matching transcript entries.
                              </div>
                            ) : (
                              transcriptEntries.map((entry) => {
                                const speaker =
                                  participantLookup[entry.participant] || 'Participant';
                                return (
                                  <div key={entry.name} className="px-4 py-3 space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                                        {speaker}
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                                        {formatTimeOnly(entry.startTime)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                      {entry.text}
                                    </p>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {artifactTab === 'participants' && (
                    <div>
                      {!artifacts?.participants.length ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          No participant records available for this session.
                        </p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2.5 px-3.5 font-medium">Participant</th>
                                <th className="py-2.5 px-3.5 font-medium">Type</th>
                                <th className="py-2.5 px-3.5 font-medium text-right">Joined</th>
                                <th className="py-2.5 px-3.5 font-medium text-right">Duration</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                              {artifacts.participants.map((p) => {
                                const typeLabel = p.signedinUser
                                  ? 'Google Account'
                                  : p.phoneUser
                                  ? 'Phone'
                                  : 'Guest';
                                return (
                                  <tr
                                    key={p.name}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-900/40"
                                  >
                                    <td className="py-2.5 px-3.5 font-medium text-slate-900 dark:text-slate-100">
                                      {getParticipantDisplayName(p)}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400">
                                      {typeLabel}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                      {formatTimeOnly(p.earliestStartTime)}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                                      {formatDuration(p.earliestStartTime, p.latestEndTime)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {artifactTab === 'recordings' && (
                    <div>
                      {!artifacts?.recordings.length ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          No recordings found for this conference.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg">
                          {artifacts.recordings.map((rec) => (
                            <div
                              key={rec.name}
                              className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  Recording · {rec.state || 'READY'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  {formatTimestamp(rec.startTime)} —{' '}
                                  {formatDuration(rec.startTime, rec.endTime)}
                                </p>
                              </div>
                              {rec.driveDestination?.exportUri && (
                                <a
                                  href={rec.driveDestination.exportUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-blue-600 dark:text-blue-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                                >
                                  Open Recording
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
