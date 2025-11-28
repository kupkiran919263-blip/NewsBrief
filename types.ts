export interface Article {
  id: string;
  type: 'text' | 'url' | 'search';
  content: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export enum AppState {
  IDLE = 'IDLE',
  SUMMARIZING = 'SUMMARIZING',
  SYNTHESIZING = 'SYNTHESIZING',
  READY = 'READY',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface AudioData {
  buffer: AudioBuffer;
  summaryText: string;
}

export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Fenrir = 'Fenrir',
  Charon = 'Charon',
  Zephyr = 'Zephyr'
}

export type Language = 'English' | 'Spanish' | 'French' | 'German' | 'Japanese';
export type VoiceGender = 'Male' | 'Female';

export const LANGUAGES: Language[] = ['English', 'Spanish', 'French', 'German', 'Japanese'];

// New interface for caching background generation results
export interface CachedBriefing {
  id: string;
  summary: string;
  sources: GroundingSource[];
  audioBuffer: AudioBuffer | null;
  imageUrl: string | null;
  status: 'pending' | 'ready' | 'error';
  timestamp: number;
}