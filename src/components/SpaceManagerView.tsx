import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  PhoneOff,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Video,
} from 'lucide-react';
import {
  AccessType,
  AutoGenerationType,
  DefaultJoinAsViewerType,
  EntryPointAccess,
  MeetSpace,
  ModerationMode,
  RestrictionType,
  SpaceConfig,
} from '../lib/meetApi';

interface SpaceManagerViewProps {
  isAuthenticated: boolean;
  spaces: MeetSpace[];
  selectedSpace: MeetSpace | null;
  isBusy: boolean;
  apiError: string | null;
  onSelectSpace: (space: MeetSpace) => void;
  onCreateConfiguredSpace: (config: SpaceConfig) => Promise<void>;
  onLookupSpace: (codeOrUrl: string) => Promise<void>;
  onRefreshSpace: (spaceName: string) => Promise<void>;
  onRequestUpdateSpace: (
    space: MeetSpace,
    nextConfig: SpaceConfig,
    updateMask: string[],
    summaryLines: string[]
  ) => void;
  onRequestEndConference: (space: MeetSpace) => void;
  onOpenInStage: (space: MeetSpace) => void;
  onRequireAuth: () => void;
}

export const SpaceManagerView: React.FC<SpaceManagerViewProps> = ({
  isAuthenticated,
  spaces,
  selectedSpace,
  isBusy,
  apiError,
  onSelectSpace,
  onCreateConfiguredSpace,
  onLookupSpace,
  onRefreshSpace,
  onRequestUpdateSpace,
  onRequestEndConference,
  onOpenInStage,
  onRequireAuth,
}) => {
  const [lookupInput, setLookupInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Editable config state synced to selectedSpace or new room builder
  const [accessType, setAccessType] = useState<AccessType>('TRUSTED');
  const [entryPointAccess, setEntryPointAccess] = useState<EntryPointAccess>('ALL');
  const [moderation, setModeration] = useState<ModerationMode>('OFF');
  const [chatRestriction, setChatRestriction] = useState<RestrictionType>('NO_RESTRICTION');
  const [reactionRestriction, setReactionRestriction] =
    useState<RestrictionType>('NO_RESTRICTION');
  const [presentRestriction, setPresentRestriction] =
    useState<RestrictionType>('NO_RESTRICTION');
  const [defaultViewer, setDefaultViewer] = useState<DefaultJoinAsViewerType>('OFF');

  // Optional Workspace artifact settings (kept off/unspecified unless user toggles)
  const [includeArtifactConfig, setIncludeArtifactConfig] = useState(false);
  const [autoRecording, setAutoRecording] = useState<AutoGenerationType>('OFF');
  const [autoTranscription, setAutoTranscription] = useState<AutoGenerationType>('OFF');
  const [autoSmartNotes, setAutoSmartNotes] = useState<AutoGenerationType>('OFF');

  useEffect(() => {
    if (!selectedSpace?.config) return;
    const cfg = selectedSpace.config;
    setAccessType(cfg.accessType || 'TRUSTED');
    setEntryPointAccess(cfg.entryPointAccess || 'ALL');
    setModeration(cfg.moderation || 'OFF');
    setChatRestriction(cfg.moderationRestrictions?.chatRestriction || 'NO_RESTRICTION');
    setReactionRestriction(
      cfg.moderationRestrictions?.reactionRestriction || 'NO_RESTRICTION'
    );
    setPresentRestriction(
      cfg.moderationRestrictions?.presentRestriction || 'NO_RESTRICTION'
    );
    setDefaultViewer(cfg.moderationRestrictions?.defaultJoinAsViewerType || 'OFF');

    if (cfg.artifactConfig) {
      setIncludeArtifactConfig(true);
      setAutoRecording(cfg.artifactConfig.recordingConfig?.autoRecordingGeneration || 'OFF');
      setAutoTranscription(
        cfg.artifactConfig.transcriptionConfig?.autoTranscriptionGeneration || 'OFF'
      );
      setAutoSmartNotes(cfg.artifactConfig.smartNotesConfig?.autoSmartNotesGeneration || 'OFF');
    } else {
      setIncludeArtifactConfig(false);
    }
  }, [selectedSpace]);

  const buildConfigPayload = (): { config: SpaceConfig; mask: string[]; summary: string[] } => {
    const config: SpaceConfig = {
      accessType,
      entryPointAccess,
      moderation,
    };
    const mask: string[] = [
      'config.accessType',
      'config.entryPointAccess',
      'config.moderation',
    ];
    const summary: string[] = [
      `Access policy: ${accessType}`,
      `Entry point access: ${entryPointAccess}`,
      `Host moderation: ${moderation}`,
    ];

    if (moderation === 'ON') {
      config.moderationRestrictions = {
        chatRestriction,
        reactionRestriction,
        presentRestriction,
        defaultJoinAsViewerType: defaultViewer,
      };
      mask.push('config.moderationRestrictions');
      summary.push(
        `Chat: ${chatRestriction}, Present: ${presentRestriction}, Join as viewer: ${defaultViewer}`
      );
    }

    if (includeArtifactConfig) {
      config.artifactConfig = {
        recordingConfig: { autoRecordingGeneration: autoRecording },
        transcriptionConfig: { autoTranscriptionGeneration: autoTranscription },
        smartNotesConfig: { autoSmartNotesGeneration: autoSmartNotes },
      };
      mask.push('config.artifactConfig');
      summary.push(
        `Auto-recording: ${autoRecording}, Auto-transcription: ${autoTranscription}, Smart notes: ${autoSmartNotes}`
      );
    }

    return { config, mask, summary };
  };

  const handleSaveSettings = () => {
    if (!selectedSpace) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const { config, mask, summary } = buildConfigPayload();
    onRequestUpdateSpace(selectedSpace, config, mask, summary);
  };

  const handleCreateCustomRoom = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const { config } = buildConfigPayload();
    await onCreateConfiguredSpace(config);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupInput.trim()) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    await onLookupSpace(lookupInput.trim());
    setLookupInput('');
  };

  const copyLink = async (space: MeetSpace) => {
    try {
      await navigator.clipboard.writeText(space.meetingUri);
      setCopiedId(space.name);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
            Meeting Rooms & Host Controls
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configure Google Meet space access policies, moderation locks, and active conference controls.
          </p>
        </div>

        <form onSubmit={handleLookup} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Find room by code or URL"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={isBusy || !lookupInput.trim()}
            className="h-10 px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            Lookup
          </button>
        </form>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4 cols: Session Rooms List */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Loaded Spaces ({spaces.length})
            </h2>
            <button
              type="button"
              onClick={handleCreateCustomRoom}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Create New
            </button>
          </div>

          {spaces.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="mx-auto h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No spaces loaded yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Create a configured room using the panel on the right, or look up an existing Meet code.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {spaces.map((sp) => {
                const isSelected = selectedSpace?.name === sp.name;
                return (
                  <div
                    key={sp.name}
                    className={`p-4 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSpace(sp)}
                      className="w-full text-left space-y-1 focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {sp.meetingCode}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            sp.activeConference
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {sp.activeConference ? 'Active call' : 'Standby'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {sp.config?.accessType || 'DEFAULT'} · Moderation {sp.config?.moderation || 'OFF'}
                      </p>
                    </button>

                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => copyLink(sp)}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                      >
                        {copiedId === sp.name ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedId === sp.name ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenInStage(sp)}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Video className="h-3 w-3" />
                        Stage
                      </button>
                      <a
                        href={sp.meetingUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ml-auto"
                      >
                        Join
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 8 cols: Room Configuration & Host Controls */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {selectedSpace
                  ? `Configure Space: ${selectedSpace.meetingCode}`
                  : 'New Configured Room Builder'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedSpace
                  ? selectedSpace.meetingUri
                  : 'Choose defaults below and create a new Google Meet space with these policies.'}
              </p>
            </div>

            {selectedSpace && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRefreshSpace(selectedSpace.name)}
                  disabled={isBusy}
                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => onRequestEndConference(selectedSpace)}
                  disabled={isBusy}
                  className="h-9 px-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 text-xs font-medium text-red-700 dark:text-red-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  End Active Call
                </button>
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Access & Entry Point */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="access-type"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Access Policy
                </label>
                <select
                  id="access-type"
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value as AccessType)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="OPEN">Open — Anyone with the link can join</option>
                  <option value="TRUSTED">Trusted — Org members & invited guests</option>
                  <option value="RESTRICTED">Restricted — Only invited attendees</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="entry-point"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  Entry Point Access
                </label>
                <select
                  id="entry-point"
                  value={entryPointAccess}
                  onChange={(e) => setEntryPointAccess(e.target.value as EntryPointAccess)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="ALL">All Google Meet entry points</option>
                  <option value="CREATOR_APP_ONLY">Creator app entry points only</option>
                </select>
              </div>
            </div>

            {/* Host Moderation Controls */}
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Host Moderation Locks
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Control whether participants can share screens, send chat messages, or react.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModeration('OFF')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      moderation === 'OFF'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeration('ON')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      moderation === 'ON'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    On
                  </button>
                </div>
              </div>

              {moderation === 'ON' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="chat-restriction"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      In-call Chat
                    </label>
                    <select
                      id="chat-restriction"
                      value={chatRestriction}
                      onChange={(e) => setChatRestriction(e.target.value as RestrictionType)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="NO_RESTRICTION">Everyone can chat</option>
                      <option value="HOSTS_ONLY">Hosts only</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="present-restriction"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Screen Presenting
                    </label>
                    <select
                      id="present-restriction"
                      value={presentRestriction}
                      onChange={(e) => setPresentRestriction(e.target.value as RestrictionType)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="NO_RESTRICTION">Everyone can present</option>
                      <option value="HOSTS_ONLY">Hosts only</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="reaction-restriction"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Emoji Reactions
                    </label>
                    <select
                      id="reaction-restriction"
                      value={reactionRestriction}
                      onChange={(e) => setReactionRestriction(e.target.value as RestrictionType)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="NO_RESTRICTION">Everyone can react</option>
                      <option value="HOSTS_ONLY">Hosts only</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="viewer-default"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Default Join as Viewer
                    </label>
                    <select
                      id="viewer-default"
                      value={defaultViewer}
                      onChange={(e) =>
                        setDefaultViewer(e.target.value as DefaultJoinAsViewerType)
                      }
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="OFF">Join as contributor</option>
                      <option value="ON">Join as viewer</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Workspace Artifact Auto-Generation (Optional) */}
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Automatic Artifacts (Workspace Editions)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure automatic recording, transcription, and Gemini smart notes when supported by your Google Workspace tier.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={includeArtifactConfig}
                    onChange={(e) => setIncludeArtifactConfig(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Include in config
                </label>
              </div>

              {includeArtifactConfig && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1">
                    <label
                      htmlFor="auto-rec"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Auto Recording
                    </label>
                    <select
                      id="auto-rec"
                      value={autoRecording}
                      onChange={(e) => setAutoRecording(e.target.value as AutoGenerationType)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="OFF">Off</option>
                      <option value="ON">On</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="auto-trans"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Auto Transcription
                    </label>
                    <select
                      id="auto-trans"
                      value={autoTranscription}
                      onChange={(e) =>
                        setAutoTranscription(e.target.value as AutoGenerationType)
                      }
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="OFF">Off</option>
                      <option value="ON">On</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="auto-notes"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Smart Notes
                    </label>
                    <select
                      id="auto-notes"
                      value={autoSmartNotes}
                      onChange={(e) => setAutoSmartNotes(e.target.value as AutoGenerationType)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="OFF">Off</option>
                      <option value="ON">On</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedSpace
                  ? 'Saving updates asks for confirmation before modifying the live Meet space.'
                  : 'Creates a new Google Meet space with the settings above.'}
              </span>

              <div className="flex items-center gap-3">
                {selectedSpace ? (
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={isBusy}
                    className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    Save Space Settings
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateCustomRoom}
                    disabled={isBusy}
                    className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Create Configured Space
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
