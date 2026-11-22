export type AccessType = 'ACCESS_TYPE_UNSPECIFIED' | 'OPEN' | 'TRUSTED' | 'RESTRICTED';
export type EntryPointAccess = 'ENTRY_POINT_ACCESS_UNSPECIFIED' | 'ALL' | 'CREATOR_APP_ONLY';
export type ModerationMode = 'MODERATION_UNSPECIFIED' | 'OFF' | 'ON';
export type RestrictionType = 'RESTRICTION_TYPE_UNSPECIFIED' | 'HOSTS_ONLY' | 'NO_RESTRICTION';
export type DefaultJoinAsViewerType = 'DEFAULT_JOIN_AS_VIEWER_TYPE_UNSPECIFIED' | 'ON' | 'OFF';
export type AutoGenerationType = 'AUTO_GENERATION_TYPE_UNSPECIFIED' | 'ON' | 'OFF';

export interface SpaceConfig {
  accessType?: AccessType;
  entryPointAccess?: EntryPointAccess;
  moderation?: ModerationMode;
  moderationRestrictions?: {
    chatRestriction?: RestrictionType;
    reactionRestriction?: RestrictionType;
    presentRestriction?: RestrictionType;
    defaultJoinAsViewerType?: DefaultJoinAsViewerType;
  };
  artifactConfig?: {
    recordingConfig?: { autoRecordingGeneration?: AutoGenerationType };
    transcriptionConfig?: { autoTranscriptionGeneration?: AutoGenerationType };
    smartNotesConfig?: { autoSmartNotesGeneration?: AutoGenerationType };
  };
}

export interface MeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
  config?: SpaceConfig;
  activeConference?: {
    conferenceRecord: string;
  };
}

export interface ConferenceRecord {
  name: string;
  startTime?: string;
  endTime?: string;
  expireTime?: string;
  space?: string;
}

export interface MeetParticipant {
  name: string;
  earliestStartTime?: string;
  latestEndTime?: string;
  signedinUser?: {
    user: string;
    displayName: string;
  };
  anonymousUser?: {
    displayName: string;
  };
  phoneUser?: {
    displayName: string;
  };
}

export interface MeetRecording {
  name: string;
  state?: 'STATE_UNSPECIFIED' | 'STARTED' | 'ENDED' | 'FILE_GENERATED';
  startTime?: string;
  endTime?: string;
  driveDestination?: {
    file: string;
    exportUri: string;
  };
}

export interface MeetTranscript {
  name: string;
  state?: 'STATE_UNSPECIFIED' | 'STARTED' | 'ENDED' | 'FILE_GENERATED';
  startTime?: string;
  endTime?: string;
  docsDestination?: {
    document: string;
    exportUri: string;
  };
}

export interface TranscriptEntry {
  name: string;
  participant: string;
  text: string;
  languageCode?: string;
  startTime?: string;
  endTime?: string;
}

export class MeetApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MeetApiError';
    this.status = status;
    this.code = code;
  }
}

const MEET_BASE = 'https://meet.googleapis.com/v2';

async function meetFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${MEET_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Google Meet request failed (${res.status})`;
    let code: string | undefined;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
      }
      if (errBody?.error?.status) {
        code = errBody.error.status;
      }
    } catch {
      // Fallback to status message
    }
    throw new MeetApiError(message, res.status, code);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Extracts a normalized space resource path (`spaces/{codeOrId}`) from
 * a meeting code (`abc-defg-hij`), full URL (`https://meet.google.com/abc-defg-hij`),
 * or existing resource name (`spaces/xyz`).
 */
export function normalizeSpaceResource(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('spaces/')) {
    return trimmed;
  }
  try {
    if (trimmed.includes('meet.google.com/')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const slug = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (slug) return `spaces/${slug}`;
    }
  } catch {
    // Fall through to raw code handling
  }
  return `spaces/${trimmed.replace(/^\/+/, '')}`;
}

export async function createSpace(
  accessToken: string,
  config?: SpaceConfig
): Promise<MeetSpace> {
  const payload = config && Object.keys(config).length > 0 ? { config } : {};
  return meetFetch<MeetSpace>('/spaces', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSpace(
  accessToken: string,
  spaceInput: string
): Promise<MeetSpace> {
  const resource = normalizeSpaceResource(spaceInput);
  return meetFetch<MeetSpace>(`/${resource}`, accessToken, {
    method: 'GET',
  });
}

export async function updateSpace(
  accessToken: string,
  spaceName: string,
  config: SpaceConfig,
  updateMask: string[]
): Promise<MeetSpace> {
  const resource = normalizeSpaceResource(spaceName);
  const params = new URLSearchParams();
  params.set('updateMask', updateMask.join(','));
  return meetFetch<MeetSpace>(`/${resource}?${params.toString()}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ name: resource, config }),
  });
}

export async function endActiveConference(
  accessToken: string,
  spaceName: string
): Promise<void> {
  const resource = normalizeSpaceResource(spaceName);
  await meetFetch<Record<string, never>>(`/${resource}:endActiveConference`, accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listConferenceRecords(
  accessToken: string,
  pageSize = 25,
  filter?: string
): Promise<{ conferenceRecords: ConferenceRecord[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (filter) params.set('filter', filter);
  const data = await meetFetch<{ conferenceRecords?: ConferenceRecord[]; nextPageToken?: string }>(
    `/conferenceRecords?${params.toString()}`,
    accessToken
  );
  return {
    conferenceRecords: data.conferenceRecords ?? [],
    nextPageToken: data.nextPageToken,
  };
}

export async function listParticipants(
  accessToken: string,
  conferenceRecordName: string
): Promise<MeetParticipant[]> {
  const data = await meetFetch<{ participants?: MeetParticipant[] }>(
    `/${conferenceRecordName}/participants?pageSize=100`,
    accessToken
  );
  return data.participants ?? [];
}

export async function listRecordings(
  accessToken: string,
  conferenceRecordName: string
): Promise<MeetRecording[]> {
  const data = await meetFetch<{ recordings?: MeetRecording[] }>(
    `/${conferenceRecordName}/recordings`,
    accessToken
  );
  return data.recordings ?? [];
}

export async function listTranscripts(
  accessToken: string,
  conferenceRecordName: string
): Promise<MeetTranscript[]> {
  const data = await meetFetch<{ transcripts?: MeetTranscript[] }>(
    `/${conferenceRecordName}/transcripts`,
    accessToken
  );
  return data.transcripts ?? [];
}

export async function listTranscriptEntries(
  accessToken: string,
  transcriptName: string
): Promise<TranscriptEntry[]> {
  const data = await meetFetch<{ transcriptEntries?: TranscriptEntry[] }>(
    `/${transcriptName}/entries?pageSize=100`,
    accessToken
  );
  return data.transcriptEntries ?? [];
}

export function getParticipantDisplayName(p: MeetParticipant): string {
  return (
    p.signedinUser?.displayName ||
    p.anonymousUser?.displayName ||
    p.phoneUser?.displayName ||
    'Guest Participant'
  );
}

export function formatDuration(startIso?: string, endIso?: string): string {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const totalSec = Math.floor((end - start) / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeOnly(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
