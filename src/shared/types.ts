export type Suit = "ouros" | "espadas" | "copas" | "paus";
export type Rank = "4" | "5" | "6" | "7" | "Q" | "J" | "K" | "A" | "2" | "3";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Team = "A" | "B";

export interface Player {
  id: string;
  nickname: string;
  team: Team;
  hand: Card[];
  connected: boolean;
}

export type RoomStatus = "waiting" | "playing" | "finished";

export interface VazaResult {
  winner: Team | "draw";
  cards: { playerId: string; card: Card }[];
}

export interface TrucoRequest {
  from: string;
  level: number; // 3, 6, 9, 12
}

export type MãoDeOnzeStatus = "none" | "pending" | "accepted" | "rejected";

export interface GameState {
  status: RoomStatus;
  players: Player[];
  scores: { A: number; B: number };
  vazaScores: { A: number; B: number }; // vazas ganhas na mão atual
  currentTurnIndex: number;
  dealerIndex: number;
  vira: Card | null;
  currentVaza: { playerId: string; card: Card }[];
  vazas: VazaResult[];
  trucoRequest: TrucoRequest | null;
  trucoLevel: number; // valor atual da mão (1, 3, 6, 9, 12)
  winner: Team | null;
  mãoDeOnze: {
    status: MãoDeOnzeStatus;
    team: Team | null; // time que está em 11 pontos
    deciders: string[]; // IDs dos jogadores que precisam decidir
    decisions: Map<string, boolean>; // playerId -> aceitou?
  } | null;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  game: GameState;
}

export interface ServerToClientEvents {
  "room-created": (data: { roomId: string; code: string }) => void;
  "room-joined": (data: { roomId: string }) => void;
  "room-error": (message: string) => void;
  "room-updated": (room: Room) => void;
  "game-started": (game: GameState) => void;
  "game-updated": (game: GameState) => void;
  "card-played": (data: { playerId: string; card: Card }) => void;
  "truco-requested": (data: { from: string; level: number }) => void;
  "truco-responded": (data: { accepted: boolean; level: number }) => void;
  "vaza-result": (data: { winner: Team | "draw"; cards: { playerId: string; card: Card }[] }) => void;
  "mão-ended": (data: { winner: Team; scores: { A: number; B: number } }) => void;
  "mão-de-onze": (data: { team: Team }) => void;
  "player-disconnected": (data: { playerId: string; timeout: number }) => void;
  "player-reconnected": (data: { playerId: string }) => void;
  "room-closed": (message: string) => void;
}

export interface ClientToServerEvents {
  "create-room": (data: { nickname: string }) => void;
  "join-room": (data: { code: string; nickname: string; team: Team }) => void;
  "start-game": () => void;
  "play-card": (data: { cardIndex: number }) => void;
  "request-truco": () => void;
  "respond-truco": (data: { accept: boolean }) => void;
  "respond-mão-de-onze": (data: { accept: boolean }) => void;
}
