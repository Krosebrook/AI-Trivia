
export interface HostPersonality {
  id: string;
  name: string;
  description: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  prompt: string;
  avatar: string;
  isCustom?: boolean;
}

export interface TriviaQuestion {
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  source?: string;
}

export interface QuestionResult {
  question: string;
  correctAnswer: string;
  userWasCorrect: boolean;
  hintUsed: boolean;
  responseTime: number; // ms
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  topic: string;
  date: string;
}

export interface GameHistoryEntry {
  id: string;
  date: string;
  topic: string;
  difficulty: string;
  score: number;
  hostName: string;
}

export interface AppSettings {
  hostVolume: number; // 0.0 to 1.0
  sfxVolume: number; // 0.0 to 1.0
  defaultHostId: string;
  hasSeenTutorial: boolean;
  showInGameStats: boolean;
}

export enum GameStatus {
  SETUP = 'SETUP',
  LOADING_QUESTIONS = 'LOADING_QUESTIONS',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export interface TranscriptionItem {
  role: 'user' | 'model';
  text: string;
}

export interface LiveStats {
  currentStreak: number;
  longestStreak: number;
  avgResponseTime: number; // ms
  totalQuestionsAnswered: number;
}
