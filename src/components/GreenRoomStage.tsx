import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  ExternalLink,
  FlipHorizontal2,
  Grid2x2,
  LayoutPanelLeft,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Subtitles,
  User,
  Video,
} from 'lucide-react';
import { MeetSpace } from '../lib/meetApi';

type StageLayout = 'solo' | 'grid' | 'spotlight';

interface StudioParticipant {
  id: string;
  name: string;
  role: string;
  imageSrc: string;
  initials: string;
  muted: boolean;
}

const PREVIEW_PARTICIPANTS: StudioParticipant[] = [
  {
    id: 'maya',
    name: 'Maya Lin',
    role: 'Product Design',
    imageSrc: '/src/assets/images/participant_studio_maya_1795342201587.jpg',
    initials: 'ML',
    muted: false,
  },
  {
    id: 'david',
    name: 'David Mercer',
    role: 'Systems Architecture',
    imageSrc: '/src/assets/images/participant_studio_david_1795342201341.jpg',
    initials: 'DM',
    muted: true,
  },
  {
    id: 'elena',
    name: 'Elena Sato',
    role: 'Engineering Lead',
    imageSrc: '/src/assets/images/participant_studio_elena_1795342201318.jpg',
    initials: 'ES',
    muted: false,
  },
];

interface GreenRoomStageProps {
  isAuthenticated: boolean;
  userDisplayName: string;
  userPhotoUrl?: string | null;
  activeSpace: MeetSpace | null;
  recentSpaces: MeetSpace[];
  isCreatingSpace: boolean;
  isLookingUpSpace: boolean;
  apiError: string | null;
  onCreateInstantSpace: () => Promise<void>;
  onLookupSpace: (codeOrUrl: string) => Promise<void>;
  onRefreshSpace: (spaceName: string) => Promise<void>;
  onEndConference: (space: MeetSpace) => void;
  onOpenSettingsForSpace: (space: MeetSpace) => void;
  onSelectRecentSpace: (space: MeetSpace) => void;
  onRequireAuth: () => void;
}

export const GreenRoomStage: React.FC<GreenRoomStageProps> = ({
  isAuthenticated,
  userDisplayName,
  userPhotoUrl,
  activeSpace,
  recentSpaces,
  isCreatingSpace,
  isLookingUpSpace,
  apiError,
  onCreateInstantSpace,
  onLookupSpace,
  onRefreshSpace,
  onEndConference,
  onOpenSettingsForSpace,
  onSelectRecentSpace,
  onRequireAuth,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [copiedUri, setCopiedUri] = useState(false);

  // Media hardware state
  const [mediaActive, setMediaActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [softFocus, setSoftFocus] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Screen share & captions
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [captionNotice, setCaptionNotice] = useState<string | null>(null);

  // Stage framing layout
  const [layout, setLayout] = useState<StageLayout>('solo');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [studioElapsedSec, setStudioElapsedSec] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Track studio elapsed time cleanly when media or activeSpace is loaded
  useEffect(() => {
    if (!mediaActive && !activeSpace) {
      setStudioElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStudioElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mediaActive, activeSpace]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const stopMedia = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setAudioLevel(0);
    setMediaActive(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(cams);
      setAudioDevices(mics);
      if (!selectedVideoId && cams[0]?.deviceId) setSelectedVideoId(cams[0].deviceId);
      if (!selectedAudioId && mics[0]?.deviceId) setSelectedAudioId(mics[0].deviceId);
    } catch {
      // Ignore device enumeration errors
    }
  }, [selectedAudioId, selectedVideoId]);

  const startMedia = useCallback(
    async (videoId?: string, audioId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError('Camera and microphone APIs are unavailable in this browser context.');
        return;
      }
      setMediaError(null);
      stopMedia();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoId ? { deviceId: { exact: videoId } } : true,
          audio: audioId ? { deviceId: { exact: audioId } } : true,
        });
        mediaStreamRef.current = stream;

        stream.getVideoTracks().forEach((t) => {
          t.enabled = cameraOn;
        });
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micOn;
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Audio analyzer for real-time mic meter
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx && stream.getAudioTracks().length > 0) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const tick = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 90) * 100));
            setAudioLevel(normalized);
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }

        setMediaActive(true);
        await refreshDevices();
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError'
            ? 'Camera or microphone permission was denied. Grant access in your browser bar to preview.'
            : err?.message || 'Unable to access camera or microphone.';
        setMediaError(msg);
        setMediaActive(false);
      }
    },
    [cameraOn, micOn, refreshDevices, stopMedia]
  );

  // Keep video element synced when switching layouts
  useEffect(() => {
    if (localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [layout, screenStream, mediaActive]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream, layout]);

  useEffect(() => {
    return () => {
      stopMedia();
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [stopMedia, screenStream]);

  const toggleCamera = () => {
    if (!mediaActive) {
      setCameraOn(true);
      startMedia(selectedVideoId, selectedAudioId);
      return;
    }
    const next = !cameraOn;
    setCameraOn(next);
    mediaStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleMic = () => {
    if (!mediaActive) {
      setMicOn(true);
      startMedia(selectedVideoId, selectedAudioId);
      return;
    }
    const next = !micOn;
    setMicOn(next);
    mediaStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported in this browser.');
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      display.getVideoTracks()[0]?.addEventListener('ended', () => {
        setScreenStream(null);
      });
      setScreenStream(display);
      if (layout === 'solo') {
        setLayout('spotlight');
      }
    } catch {
      // User cancelled screen picker
    }
  };

  const toggleCaptions = () => {
    if (captionsOn) {
      setCaptionsOn(false);
      setCaptionNotice(null);
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptionsOn(true);
      setCaptionNotice('Live speech recognition is unavailable in this browser.');
      return;
    }

    setCaptionNotice(null);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = Math.max(0, event.results.length - 2); i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      setCaptionText(transcript.trim());
    };
    recognition.onerror = () => {
      setCaptionNotice('Microphone speech capture paused.');
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setCaptionsOn(true);
    } catch {
      setCaptionNotice('Could not start live captions.');
    }
  };

  const handleCopyUri = async () => {
    if (!activeSpace?.meetingUri) return;
    try {
      await navigator.clipboard.writeText(activeSpace.meetingUri);
      setCopiedUri(true);
      window.setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    await onLookupSpace(joinInput.trim());
  };

  const renderSelfTile = (compact = false) => (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
      {mediaActive && cameraOn ? (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover transition-[filter] duration-200 ${
            mirrorVideo ? '-scale-x-100' : ''
          } ${softFocus ? 'blur-[1.5px] contrast-105' : ''}`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          {userPhotoUrl ? (
            <img
              src={userPhotoUrl}
              alt={userDisplayName}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-full object-cover border border-slate-700"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <User className="h-7 w-7" />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-200">
              {mediaActive ? 'Camera turned off' : 'Studio preview idle'}
            </p>
            {!mediaActive && !compact && (
              <button
                type="button"
                onClick={() => startMedia(selectedVideoId, selectedAudioId)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <Camera className="h-3.5 w-3.5" />
                Check Camera & Microphone
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrim for high-contrast bottom tile label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-xs text-white">
        <span className="font-medium truncate">
          {userDisplayName || 'You'} (Preview)
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-200 shrink-0">
          {mediaActive && micOn ? (
            <Mic className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-red-400" />
          )}
          <span>{mediaActive && micOn ? 'Mic on' : 'Muted'}</span>
        </span>
      </div>
    </div>
  );

  const renderRemoteTile = (p: StudioParticipant) => (
    <div
      key={p.id}
      className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center"
    >
      {!brokenImages[p.id] ? (
        <img
          src={p.imageSrc}
          alt={`${p.name} — ${p.role}`}
          referrerPolicy="no-referrer"
          onError={() => setBrokenImages((prev) => ({ ...prev, [p.id]: true }))}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2 p-4">
          <div className="h-14 w-14 rounded-full bg-slate-700/80 flex items-center justify-center text-sm font-semibold text-white">
            {p.initials}
          </div>
          <span className="text-xs text-slate-300">{p.name}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-xs text-white">
        <div className="truncate">
          <span className="font-medium">{p.name}</span>
          <span className="text-slate-300"> · {p.role}</span>
        </div>
        {p.muted ? (
          <MicOff className="h-3.5 w-3.5 text-slate-300 shrink-0" aria-label="Muted" />
        ) : (
          <Mic className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-label="Unmuted" />
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] p-5 flex flex-col justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
              Studio Green Room & Instant Meet
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Verify framing, microphone levels, and screen sharing before launching your Google Meet space.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => (isAuthenticated ? onCreateInstantSpace() : onRequireAuth())}
              disabled={isCreatingSpace}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Plus className="h-4 w-4" />
              {isCreatingSpace ? 'Creating Room...' : 'New Instant Meeting'}
            </button>
            {activeSpace && (
              <a
                href={activeSpace.meetingUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google Meet
              </a>
            )}
          </div>
        </div>

        <form
          onSubmit={handleLookupSubmit}
          className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] p-5 flex flex-col justify-between gap-4"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Join or Inspect a Meet Space
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Paste a Meet code (<span className="font-mono text-xs">abc-defg-hij</span>) or full URL to inspect access controls and stage it here.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij or abc-defg-hij"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={isLookingUpSpace || !joinInput.trim()}
              className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {isLookingUpSpace ? 'Loading...' : 'Load Room'}
            </button>
          </div>
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

      {/* Main 2-Column Stage + Diagnostics Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 8 cols: Enhanced Video Stage */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0B0F17] text-white flex flex-col overflow-hidden">
          {/* Stage Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/90 bg-slate-950/70">
            <div className="flex items-center gap-3 text-xs text-slate-300 min-w-0">
              <span className="font-medium text-white truncate">
                {activeSpace ? `Room ${activeSpace.meetingCode}` : 'Local Hardware Studio'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-400">
                {formatTimer(studioElapsedSec)}
              </span>
              {screenStream && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-emerald-400 font-medium">Sharing screen</span>
                </>
              )}
            </div>

            {/* Layout Mode Switcher */}
            <div
              className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800"
              role="group"
              aria-label="Stage layout mode"
            >
              <button
                type="button"
                onClick={() => setLayout('solo')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layout === 'solo'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Solo
              </button>
              <button
                type="button"
                onClick={() => setLayout('spotlight')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layout === 'spotlight'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutPanelLeft className="h-3.5 w-3.5" />
                Spotlight
              </button>
              <button
                type="button"
                onClick={() => setLayout('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layout === 'grid'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid2x2 className="h-3.5 w-3.5" />
                2×2 Grid
              </button>
            </div>
          </div>

          {/* Video Canvas */}
          <div className="relative flex-1 min-h-[380px] sm:min-h-[440px] p-4 flex flex-col justify-center">
            {layout === 'solo' && (
              <div className="w-full h-[360px] sm:h-[420px]">
                {screenStream ? (
                  <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                    <div className="absolute bottom-3 right-3 w-44 h-28 shadow-xl">
                      {renderSelfTile(true)}
                    </div>
                  </div>
                ) : (
                  renderSelfTile(false)
                )}
              </div>
            )}

            {layout === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full h-[420px]">
                <div className="h-full min-h-[180px]">{renderSelfTile(true)}</div>
                {PREVIEW_PARTICIPANTS.map((p) => (
                  <div key={p.id} className="h-full min-h-[180px]">
                    {renderRemoteTile(p)}
                  </div>
                ))}
              </div>
            )}

            {layout === 'spotlight' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full h-[420px]">
                <div className="md:col-span-3 h-full min-h-[240px]">
                  {screenStream ? (
                    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
                      <video
                        ref={screenVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain bg-black"
                      />
                      <div className="absolute bottom-2.5 left-3 px-2.5 py-1 rounded bg-black/70 text-xs text-white">
                        Your Screen Share
                      </div>
                    </div>
                  ) : (
                    renderRemoteTile(PREVIEW_PARTICIPANTS[0])
                  )}
                </div>
                <div className="md:col-span-1 grid grid-cols-3 md:grid-cols-1 md:grid-rows-3 gap-2.5 h-full">
                  <div className="h-full min-h-[90px]">{renderSelfTile(true)}</div>
                  <div className="h-full min-h-[90px]">{renderRemoteTile(PREVIEW_PARTICIPANTS[1])}</div>
                  <div className="h-full min-h-[90px]">{renderRemoteTile(PREVIEW_PARTICIPANTS[2])}</div>
                </div>
              </div>
            )}

            {/* Live Captions Overlay */}
            {captionsOn && (
              <div className="mt-3 rounded-lg bg-slate-900/95 border border-slate-800 px-4 py-2.5 text-sm text-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Subtitles className="h-4 w-4 text-blue-400 shrink-0" />
                  <p className="truncate text-slate-200">
                    {captionNotice || captionText || 'Listening for speech to preview captions...'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleCaptions}
                  className="text-xs text-slate-400 hover:text-white whitespace-nowrap shrink-0"
                >
                  Hide
                </button>
              </div>
            )}

            {mediaError && (
              <div className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/50 px-3.5 py-2 text-xs text-amber-200">
                {mediaError}
              </div>
            )}
          </div>

          {/* Ergonomic Bottom Control Dock */}
          <div className="px-4 py-3.5 border-t border-slate-800/90 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={mediaActive && micOn ? 'Mute microphone' : 'Unmute microphone'}
                className={`h-11 px-3.5 rounded-lg inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  mediaActive && micOn
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    : 'bg-red-600/90 hover:bg-red-600 text-white'
                }`}
              >
                {mediaActive && micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                <span>{mediaActive && micOn ? 'Mic On' : 'Mic Off'}</span>
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                aria-label={mediaActive && cameraOn ? 'Turn off camera' : 'Turn on camera'}
                className={`h-11 px-3.5 rounded-lg inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  mediaActive && cameraOn
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    : 'bg-red-600/90 hover:bg-red-600 text-white'
                }`}
              >
                {mediaActive && cameraOn ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <CameraOff className="h-4 w-4" />
                )}
                <span>{mediaActive && cameraOn ? 'Cam On' : 'Cam Off'}</span>
              </button>

              <button
                type="button"
                onClick={toggleScreenShare}
                className={`h-11 px-3.5 rounded-lg inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  screenStream
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
                }`}
              >
                <MonitorUp className="h-4 w-4" />
                <span>{screenStream ? 'Stop Share' : 'Share Screen'}</span>
              </button>

              <button
                type="button"
                onClick={toggleCaptions}
                className={`h-11 px-3.5 rounded-lg inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  captionsOn
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
                }`}
              >
                <Subtitles className="h-4 w-4" />
                <span>Captions</span>
              </button>

              <button
                type="button"
                onClick={() => setSoftFocus((v) => !v)}
                className={`h-11 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  softFocus
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
                title="Toggle soft-focus lens filter"
              >
                <Sparkles className="h-4 w-4" />
                <span>Soft Focus</span>
              </button>

              <button
                type="button"
                onClick={() => setMirrorVideo((v) => !v)}
                className={`h-11 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 border focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  mirrorVideo
                    ? 'bg-slate-800 border-slate-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
                title="Flip self-view horizontally"
              >
                <FlipHorizontal2 className="h-4 w-4" />
                <span>Mirror</span>
              </button>
            </div>

            {mediaActive && (
              <button
                type="button"
                onClick={stopMedia}
                className="h-11 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                Stop Preview
              </button>
            )}
          </div>
        </div>

        {/* Right 4 cols: Active Room Details + Audio/Video Hardware Panel */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Active Meet Room Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Meet Room
              </h2>
              {activeSpace && (
                <button
                  type="button"
                  onClick={() => onRefreshSpace(activeSpace.name)}
                  aria-label="Refresh room status"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>

            {activeSpace ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {activeSpace.meetingCode}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        activeSpace.activeConference
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {activeSpace.activeConference ? 'Live call active' : 'Ready to join'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeSpace.meetingUri}
                  </p>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                  <span>Access: {activeSpace.config?.accessType?.replace('ACCESS_TYPE_', '') || 'Default'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Moderation: {activeSpace.config?.moderation || 'OFF'}</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyUri}
                    className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedUri ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedUri ? 'Copied Link' : 'Copy Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSettingsForSpace(activeSpace)}
                    className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Host Settings
                  </button>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href={activeSpace.meetingUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Video className="h-4 w-4" />
                    Join Google Meet Now
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                  </a>

                  {activeSpace.activeConference && (
                    <button
                      type="button"
                      onClick={() => onEndConference(activeSpace)}
                      className="h-10 px-4 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                      End Active Conference for All
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-3 space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  No Google Meet space loaded yet. Create an instant meeting or enter a Meet code above to manage host settings and join.
                </p>
                {recentSpaces.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Session Rooms
                    </p>
                    <div className="space-y-1">
                      {recentSpaces.slice(0, 3).map((sp) => (
                        <button
                          key={sp.name}
                          type="button"
                          onClick={() => onSelectRecentSpace(sp)}
                          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                            {sp.meetingCode}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">Load</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hardware Diagnostics Panel */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131A26] p-5 space-y-4 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Audio & Camera Check
              </h2>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {mediaActive && micOn ? `${audioLevel}% input` : 'Idle'}
              </span>
            </div>

            {/* Live Microphone Input VU Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Microphone level</span>
                <span>{mediaActive && micOn ? (audioLevel > 8 ? 'Voice detected' : 'Quiet') : 'Muted'}</span>
              </div>
              <div className="grid grid-cols-12 gap-1 h-2.5" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, i) => {
                  const threshold = ((i + 1) / 12) * 100;
                  const active = mediaActive && micOn && audioLevel >= threshold - 6;
                  const color =
                    i >= 10
                      ? 'bg-amber-500'
                      : i >= 7
                      ? 'bg-emerald-500'
                      : 'bg-blue-600 dark:bg-blue-500';
                  return (
                    <div
                      key={i}
                      className={`rounded-xs transition-colors duration-75 ${
                        active ? color : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Device Selectors */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label
                  htmlFor="camera-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Camera
                </label>
                <select
                  id="camera-select"
                  value={selectedVideoId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedVideoId(nextId);
                    if (mediaActive) startMedia(nextId, selectedAudioId);
                  }}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {videoDevices.length === 0 ? (
                    <option value="">Default system camera</option>
                  ) : (
                    videoDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="mic-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Microphone
                </label>
                <select
                  id="mic-select"
                  value={selectedAudioId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedAudioId(nextId);
                    if (mediaActive) startMedia(selectedVideoId, nextId);
                  }}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {audioDevices.length === 0 ? (
                    <option value="">Default system microphone</option>
                  ) : (
                    audioDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Microphone ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
