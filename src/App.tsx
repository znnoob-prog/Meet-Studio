import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  History,
  LogOut,
  Menu,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  Video,
  X,
} from 'lucide-react';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/firebaseAuth';
import {
  ConferenceRecord,
  createSpace,
  endActiveConference,
  getSpace,
  listConferenceRecords,
  listParticipants,
  listRecordings,
  listTranscriptEntries,
  listTranscripts,
  MeetApiError,
  MeetParticipant,
  MeetRecording,
  MeetSpace,
  MeetTranscript,
  SpaceConfig,
  TranscriptEntry,
  updateSpace,
} from './lib/meetApi';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmActionModal, ConfirmActionState } from './components/ConfirmActionModal';
import { GreenRoomStage } from './components/GreenRoomStage';
import { SpaceManagerView } from './components/SpaceManagerView';
import { ConferenceHistoryView } from './components/ConferenceHistoryView';

type ActiveView = 'studio' | 'rooms' | 'history';

interface ConferenceArtifacts {
  participants: MeetParticipant[];
  recordings: MeetRecording[];
  transcripts: MeetTranscript[];
  entriesByTranscript: Record<string, TranscriptEntry[]>;
}

const VIEW_LABELS: Record<ActiveView, string> = {
  studio: 'Studio & Quick Join',
  rooms: 'Rooms & Host Controls',
  history: 'History & Transcripts',
};

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('studio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Meet Spaces state
  const [spaces, setSpaces] = useState<MeetSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<MeetSpace | null>(null);
  const [isSpaceBusy, setIsSpaceBusy] = useState(false);
  const [spaceError, setSpaceError] = useState<string | null>(null);

  // Conference History state
  const [records, setRecords] = useState<ConferenceRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ConferenceRecord | null>(null);
  const [artifacts, setArtifacts] = useState<ConferenceArtifacts | null>(null);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Global feedback & Confirmation Modal
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmActionState | null>(null);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const handleApiError = useCallback(
    (err: unknown, setter: (msg: string) => void) => {
      if (err instanceof MeetApiError && err.status === 401) {
        clearAccessToken();
        setToken(null);
        setNeedsAuth(true);
        setter('Your Google Meet session expired. Please sign in with Google again.');
        return;
      }
      const message =
        err instanceof Error ? err.message : 'An unexpected Google Meet error occurred.';
      setter(message);
    },
    []
  );

  const loadConferenceHistory = useCallback(
    async (overrideToken?: string) => {
      const accessToken = overrideToken || getAccessToken();
      if (!accessToken) {
        setNeedsAuth(true);
        return;
      }
      setIsLoadingRecords(true);
      setHistoryError(null);
      try {
        const res = await listConferenceRecords(accessToken, 25);
        setRecords(res.conferenceRecords);
      } catch (err) {
        handleApiError(err, setHistoryError);
      } finally {
        setIsLoadingRecords(false);
      }
    },
    [handleApiError]
  );

  useEffect(() => {
    const unsub = initAuth(
      (authedUser, accessToken) => {
        setUser(authedUser);
        setToken(accessToken);
        setNeedsAuth(false);
        loadConferenceHistory(accessToken);
      },
      (firebaseUser) => {
        setUser(firebaseUser);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, [loadConferenceHistory]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    setSpaceError(null);
    setHistoryError(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setToken(result.accessToken);
      setNeedsAuth(false);
      showNotice('Connected to Google Meet.');
      await loadConferenceHistory(result.accessToken);
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setRecords([]);
    setSelectedRecord(null);
    setArtifacts(null);
    setSpaces([]);
    setActiveSpace(null);
    showNotice('Signed out of Google Meet.');
  };

  const upsertSpace = useCallback((space: MeetSpace) => {
    setActiveSpace(space);
    setSpaces((prev) => {
      const idx = prev.findIndex((s) => s.name === space.name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = space;
        return next;
      }
      return [space, ...prev];
    });
  }, []);

  const handleCreateInstantSpace = async () => {
    const accessToken = token || getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setIsSpaceBusy(true);
    setSpaceError(null);
    try {
      const created = await createSpace(accessToken);
      upsertSpace(created);
      showNotice(`Created Meet room ${created.meetingCode}`);
    } catch (err) {
      handleApiError(err, setSpaceError);
    } finally {
      setIsSpaceBusy(false);
    }
  };

  const handleCreateConfiguredSpace = async (config: SpaceConfig) => {
    const accessToken = token || getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setIsSpaceBusy(true);
    setSpaceError(null);
    try {
      const created = await createSpace(accessToken, config);
      upsertSpace(created);
      showNotice(`Created configured room ${created.meetingCode}`);
    } catch (err) {
      handleApiError(err, setSpaceError);
    } finally {
      setIsSpaceBusy(false);
    }
  };

  const handleLookupSpace = async (codeOrUrl: string) => {
    const accessToken = token || getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setIsSpaceBusy(true);
    setSpaceError(null);
    try {
      const found = await getSpace(accessToken, codeOrUrl);
      upsertSpace(found);
      showNotice(`Loaded room ${found.meetingCode}`);
    } catch (err) {
      handleApiError(err, setSpaceError);
    } finally {
      setIsSpaceBusy(false);
    }
  };

  const handleRefreshSpace = async (spaceName: string) => {
    const accessToken = token || getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setIsSpaceBusy(true);
    setSpaceError(null);
    try {
      const updated = await getSpace(accessToken, spaceName);
      upsertSpace(updated);
    } catch (err) {
      handleApiError(err, setSpaceError);
    } finally {
      setIsSpaceBusy(false);
    }
  };

  const handleRequestUpdateSpace = (
    space: MeetSpace,
    nextConfig: SpaceConfig,
    updateMask: string[],
    summaryLines: string[]
  ) => {
    setConfirmModal({
      isOpen: true,
      title: `Update settings for ${space.meetingCode}?`,
      description:
        'You are about to modify live Google Meet room settings for this meeting space.',
      details: summaryLines,
      confirmLabel: 'Apply Settings',
      variant: 'primary',
      onConfirm: async () => {
        const accessToken = token || getAccessToken();
        if (!accessToken) {
          setConfirmModal(null);
          setNeedsAuth(true);
          return;
        }
        setConfirmModal((prev) => (prev ? { ...prev, isProcessing: true } : null));
        setSpaceError(null);
        try {
          const updated = await updateSpace(accessToken, space.name, nextConfig, updateMask);
          upsertSpace(updated);
          setConfirmModal(null);
          showNotice(`Updated settings for ${updated.meetingCode}`);
        } catch (err) {
          setConfirmModal(null);
          handleApiError(err, setSpaceError);
        }
      },
    });
  };

  const handleRequestEndConference = (space: MeetSpace) => {
    setConfirmModal({
      isOpen: true,
      title: `End active conference in ${space.meetingCode}?`,
      description:
        'This will immediately disconnect all participants currently in the Google Meet call.',
      details: [
        `Meeting code: ${space.meetingCode}`,
        'All participants will be removed from the active call.',
      ],
      confirmLabel: 'End Call for All',
      variant: 'danger',
      onConfirm: async () => {
        const accessToken = token || getAccessToken();
        if (!accessToken) {
          setConfirmModal(null);
          setNeedsAuth(true);
          return;
        }
        setConfirmModal((prev) => (prev ? { ...prev, isProcessing: true } : null));
        setSpaceError(null);
        try {
          await endActiveConference(accessToken, space.name);
          const refreshed = await getSpace(accessToken, space.name).catch(() => ({
            ...space,
            activeConference: undefined,
          }));
          upsertSpace(refreshed);
          setConfirmModal(null);
          showNotice(`Ended active conference in ${space.meetingCode}`);
        } catch (err) {
          setConfirmModal(null);
          handleApiError(err, setSpaceError);
        }
      },
    });
  };

  const handleSelectRecord = async (record: ConferenceRecord) => {
    setSelectedRecord(record);
    const accessToken = token || getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingArtifacts(true);
    setHistoryError(null);
    try {
      const [participants, recordings, transcripts] = await Promise.all([
        listParticipants(accessToken, record.name),
        listRecordings(accessToken, record.name),
        listTranscripts(accessToken, record.name),
      ]);

      const entriesByTranscript: Record<string, TranscriptEntry[]> = {};
      await Promise.all(
        transcripts.map(async (tr) => {
          const entries = await listTranscriptEntries(accessToken, tr.name);
          entriesByTranscript[tr.name] = entries;
        })
      );

      setArtifacts({
        participants,
        recordings,
        transcripts,
        entriesByTranscript,
      });
    } catch (err) {
      handleApiError(err, setHistoryError);
    } finally {
      setIsLoadingArtifacts(false);
    }
  };

  const isAuthenticated = !needsAuth && Boolean(token);

  const navItems: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
    { id: 'studio', label: 'Studio & Join', icon: <Video className="h-4 w-4" /> },
    { id: 'rooms', label: 'Rooms & Controls', icon: <SlidersHorizontal className="h-4 w-4" /> },
    { id: 'history', label: 'History & Transcripts', icon: <History className="h-4 w-4" /> },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-4">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Video className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              Meet Studio
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1" aria-label="Primary workspace navigation">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveView(item.id);
                  setMobileMenuOpen(false);
                  if (item.id === 'history' && isAuthenticated && records.length === 0) {
                    loadConferenceHistory();
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls: Theme + Google Account */}
      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{darkMode ? 'Light Workspace' : 'Dark Studio'}</span>
          </span>
          <span className="text-slate-400">{darkMode ? 'On' : 'Off'}</span>
        </button>

        {isAuthenticated && user ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Google User'}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {user.displayName || 'Google Account'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <GoogleSignInButton
              onClick={handleLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
              className="w-full"
            />
            {authError && (
              <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug">
                {authError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101622] sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-[#101622] border-r border-slate-200 dark:border-slate-800 z-10">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#101622]/95 backdrop-blur-xs flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                Meet Studio
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {VIEW_LABELS[activeView]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setActiveView('studio');
                  handleCreateInstantSpace();
                }}
                disabled={isSpaceBusy}
                className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Instant Meeting
              </button>
            ) : (
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
              />
            )}
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto space-y-6">
          {/* Prompt banner when signed out */}
          {!isAuthenticated && activeView !== 'history' && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Connect your Google account
                </span>{' '}
                to create live Google Meet rooms, modify host moderation settings, and view conference transcripts.
              </div>
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
                className="shrink-0"
              />
            </div>
          )}

          {/* Transient status notice */}
          {statusNotice && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{statusNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="text-emerald-700 dark:text-emerald-300 hover:opacity-75"
                aria-label="Dismiss message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeView === 'studio' && (
            <GreenRoomStage
              isAuthenticated={isAuthenticated}
              userDisplayName={user?.displayName || 'You'}
              userPhotoUrl={user?.photoURL}
              activeSpace={activeSpace}
              recentSpaces={spaces}
              isCreatingSpace={isSpaceBusy}
              isLookingUpSpace={isSpaceBusy}
              apiError={spaceError}
              onCreateInstantSpace={handleCreateInstantSpace}
              onLookupSpace={handleLookupSpace}
              onRefreshSpace={handleRefreshSpace}
              onEndConference={handleRequestEndConference}
              onOpenSettingsForSpace={(space) => {
                setActiveSpace(space);
                setActiveView('rooms');
              }}
              onSelectRecentSpace={(space) => setActiveSpace(space)}
              onRequireAuth={handleLogin}
            />
          )}

          {activeView === 'rooms' && (
            <SpaceManagerView
              isAuthenticated={isAuthenticated}
              spaces={spaces}
              selectedSpace={activeSpace}
              isBusy={isSpaceBusy}
              apiError={spaceError}
              onSelectSpace={(space) => setActiveSpace(space)}
              onCreateConfiguredSpace={handleCreateConfiguredSpace}
              onLookupSpace={handleLookupSpace}
              onRefreshSpace={handleRefreshSpace}
              onRequestUpdateSpace={handleRequestUpdateSpace}
              onRequestEndConference={handleRequestEndConference}
              onOpenInStage={(space) => {
                setActiveSpace(space);
                setActiveView('studio');
              }}
              onRequireAuth={handleLogin}
            />
          )}

          {activeView === 'history' && (
            <ConferenceHistoryView
              isAuthenticated={isAuthenticated}
              isLoadingRecords={isLoadingRecords}
              records={records}
              selectedRecord={selectedRecord}
              artifacts={artifacts}
              isLoadingArtifacts={isLoadingArtifacts}
              apiError={historyError}
              onRefreshRecords={() => loadConferenceHistory()}
              onSelectRecord={handleSelectRecord}
              onCreateInstantSpace={async () => {
                await handleCreateInstantSpace();
                setActiveView('studio');
              }}
              onSignIn={handleLogin}
            />
          )}
        </main>
      </div>

      {/* Explicit Confirmation Modal for Mutating/Destructive Google Meet Actions */}
      <ConfirmActionModal
        state={confirmModal}
        onClose={() => {
          if (!confirmModal?.isProcessing) {
            setConfirmModal(null);
          }
        }}
      />
    </div>
  );
}
