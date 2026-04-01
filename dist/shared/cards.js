const SUITS = ["ouros", "espadas", "copas", "paus"];
const RANKS = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
const RANK_EMOJI = {
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
const SUIT_EMOJI = {
    ouros: "♦",
    espadas: "♠",
    copas: "♥",
    paus: "♣",
};
export function getCardEmoji(card) {
    return `${RANK_EMOJI[card.rank]}${SUIT_EMOJI[card.suit]}`;
}
export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    return deck;
}
export function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
// Ordem de força base (sem manilha)
const BASE_STRENGTH = {
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
const SUIT_STRENGTH = {
    paus: 4,
    copas: 3,
    espadas: 2,
    ouros: 1,
};
// Próxima manilha baseada no vira
const MANILHA_NEXT = {
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
export function getManilhaRank(vira) {
    return MANILHA_NEXT[vira.rank];
}
export function isManilha(card, vira) {
    return card.rank === getManilhaRank(vira);
}
// Retorna a força relativa de uma carta considerando manilhas
// Cartas mais fortes retornam números maiores
export function getCardStrength(card, vira) {
    if (vira && isManilha(card, vira)) {
        // Manilhas: força = 100 + força do naipe
        return 100 + SUIT_STRENGTH[card.suit];
    }
    return BASE_STRENGTH[card.rank];
}
// Compara duas cartas. Retorna > 0 se a primeira vence, < 0 se a segunda vence, 0 se empate
export function compareCards(a, b, vira) {
    return getCardStrength(a, vira) - getCardStrength(b, vira);
}
// Determina o vencedor de uma vaza
export function getVazaWinner(cards, vira) {
    if (cards.length === 0)
        return null;
    let winner = cards[0];
    for (let i = 1; i < cards.length; i++) {
        if (compareCards(cards[i].card, winner.card, vira) > 0) {
            winner = cards[i];
        }
    }
    // Verificar empate (duas cartas de mesma força)
    const maxStrength = getCardStrength(winner.card, vira);
    const tied = cards.filter((c) => getCardStrength(c.card, vira) === maxStrength);
    if (tied.length > 1) {
        return null; // Empate
    }
    return winner;
}
