export interface Player {
  id: string;
  name: string;
  rating: string;      // e.g. "NTRP 4.5" or "UTR 9"
  ratingValue: number; // numerical for sorting, e.g. 4.5
  points: number;
  winRate: string;     // e.g. "88%"
  avatarUrl?: string;
  initials?: string;
  group: 'A' | 'B';    // A: High Skill, B: Standard
  winStreak: number;
}

export interface MatchPair {
  id: string;
  playerA: Player;
  playerB: Player;
  scoreA?: number;
  scoreB?: number;
  court?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export type ScreenMode = 'landing' | 'auth' | 'admin' | 'player_mobile';

export interface ScoreMatrixCell {
  pairIdA: string; // The row pair id
  pairIdB: string; // The col pair id
  scoreA?: number;
  scoreB?: number;
}
