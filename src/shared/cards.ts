import { Card, Suit, Rank } from "./types";

const SUITS: Suit[] = ["ouros", "espadas", "copas", "paus"];
const RANKS: Rank[] = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];

const RANK_EMOJI: Record<Rank, string> = {
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "Q": "Q",
  "J": "J",
  "K": "K",
  "A": "A",
  "2": "2",
  "3": "3",
};

const SUIT_EMOJI: Record<Suit, string> = {
  ouros: "♦",
  espadas: "♠",
  copas: "♥",
  paus: "♣",
};

export function getCardEmoji(card: Card): string {
  return `${RANK_EMOJI[card.rank]}${SUIT_EMOJI[card.suit]}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Ordem de força base (sem manilha)
const BASE_STRENGTH: Record<Rank, number> = {
  "4": 1,
  "5": 2,
  "6": 3,
  "7": 4,
  "Q": 5,
  "J": 6,
  "K": 7,
  "A": 8,
  "2": 9,
  "3": 10,
};

// Ordem de força dos naipes (para desempate)
const SUIT_STRENGTH: Record<Suit, number> = {
  paus: 4,
  copas: 3,
  espadas: 2,
  ouros: 1,
};

// Próxima manilha baseada no vira
const MANILHA_NEXT: Record<Rank, Rank> = {
  "4": "5",
  "5": "6",
  "6": "7",
  "7": "Q",
  "Q": "J",
  "J": "K",
  "K": "A",
  "A": "2",
  "2": "3",
  "3": "4",
};

export function getManilhaRank(vira: Card): Rank {
  return MANILHA_NEXT[vira.rank];
}

export function isManilha(card: Card, vira: Card): boolean {
  return card.rank === getManilhaRank(vira);
}

// Retorna a força relativa de uma carta considerando manilhas
// Cartas mais fortes retornam números maiores
export function getCardStrength(card: Card, vira: Card | null): number {
  if (vira && isManilha(card, vira)) {
    // Manilhas: força = 100 + força do naipe
    return 100 + SUIT_STRENGTH[card.suit];
  }
  return BASE_STRENGTH[card.rank];
}

// Compara duas cartas. Retorna > 0 se a primeira vence, < 0 se a segunda vence, 0 se empate
export function compareCards(a: Card, b: Card, vira: Card | null): number {
  return getCardStrength(a, vira) - getCardStrength(b, vira);
}

// Determina o vencedor de uma vaza
export function getVazaWinner(
  cards: { playerId: string; card: Card }[],
  vira: Card | null
): { playerId: string; card: Card } | null {
  if (cards.length === 0) return null;

  let winner = cards[0];
  for (let i = 1; i < cards.length; i++) {
    if (compareCards(cards[i].card, winner.card, vira) > 0) {
      winner = cards[i];
    }
  }

  // Verificar empate (duas cartas de mesma força)
  const maxStrength = getCardStrength(winner.card, vira);
  const tied = cards.filter(
    (c) => getCardStrength(c.card, vira) === maxStrength
  );

  if (tied.length > 1) {
    return null; // Empate
  }

  return winner;
}
