import { v4 as uuidv4 } from "uuid";
import { Room, GameState, Player, Team, Card } from "./shared/types.js";
import {
  createDeck,
  shuffleDeck,
  getVazaWinner,
} from "./shared/cards.js";

function generateCode(): string {
  return uuidv4().substring(0, 6).toUpperCase();
}

function createInitialGameState(): GameState {
  return {
    status: "waiting",
    players: [],
    scores: { A: 0, B: 0 },
    vazaScores: { A: 0, B: 0 },
    currentTurnIndex: 0,
    dealerIndex: 0,
    vira: null,
    currentVaza: [],
    vazas: [],
    trucoRequest: null,
    trucoLevel: 1,
    winner: null,
    mãoDeOnze: null,
  };
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  createRoom(socketId: string, nickname: string): Room {
    const id = uuidv4();
    const code = generateCode();

    const player: Player = {
      id: socketId,
      nickname,
      team: "A",
      hand: [],
      connected: true,
    };

    const game = createInitialGameState();
    game.players = [player];

    const room: Room = {
      id,
      code,
      hostId: socketId,
      game,
    };

    this.rooms.set(id, room);
    this.socketToRoom.set(socketId, id);
    return room;
  }

  joinRoom(
    code: string,
    socketId: string,
    nickname: string,
    team: Team
  ): { room: Room } | { error: string } {
    const room = this.findRoomByCode(code);
    if (!room) return { error: "Sala não encontrada" };

    if (room.game.status !== "waiting") {
      return { error: "Jogo já iniciado" };
    }

    const existing = room.game.players.find((p) => p.id === socketId);
    if (existing) return { error: "Você já está nesta sala" };

    const teamCount = room.game.players.filter((p) => p.team === team).length;
    if (teamCount >= 2) return { error: `Time ${team} já está cheio` };

    if (room.game.players.length >= 4) {
      return { error: "Sala cheia" };
    }

    const player: Player = {
      id: socketId,
      nickname,
      team,
      hand: [],
      connected: true,
    };

    room.game.players.push(player);
    this.socketToRoom.set(socketId, room.id);
    return { room };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomBySocket(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  findRoomByCode(code: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.code === code.toUpperCase()) return room;
    }
    return undefined;
  }

  canStartGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.game.status !== "waiting") return false;
    if (room.game.players.length !== 4) return false;

    const teamA = room.game.players.filter((p) => p.team === "A").length;
    const teamB = room.game.players.filter((p) => p.team === "B").length;
    return teamA === 2 && teamB === 2;
  }

  startGame(roomId: string): GameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.game.status = "playing";
    
    // Reorganizar jogadores para intercalar times: A1, B1, A2, B2
    const teamA = room.game.players.filter((p) => p.team === "A");
    const teamB = room.game.players.filter((p) => p.team === "B");
    
    if (teamA.length === 2 && teamB.length === 2) {
      room.game.players = [teamA[0], teamB[0], teamA[1], teamB[1]];
    }

    this.dealCards(room);
    return room.game;
  }

  private dealCards(room: Room): void {
    const deck = shuffleDeck(createDeck());

    // 3 cartas por jogador
    room.game.players.forEach((player, i) => {
      player.hand = deck.slice(i * 3, i * 3 + 3);
    });

    // Vira é a carta após as cartas distribuídas (12ª carta)
    room.game.vira = deck[12];

    room.game.currentVaza = [];
    room.game.vazas = [];
    room.game.vazaScores = { A: 0, B: 0 };
    room.game.trucoRequest = null;
    room.game.trucoLevel = 1;
    room.game.winner = null;
    room.game.mãoDeOnze = null;

    // Verificar Mão de Onze
    const scoreA = room.game.scores.A;
    const scoreB = room.game.scores.B;

    if (scoreA === 11 && scoreB < 11) {
      // Time A está em 11 - precisa decidir se joga
      const teamAPlayers = room.game.players.filter((p) => p.team === "A");
      room.game.mãoDeOnze = {
        status: "pending",
        team: "A",
        deciders: teamAPlayers.map((p) => p.id),
        decisions: new Map(),
      };
    } else if (scoreB === 11 && scoreA < 11) {
      // Time B está em 11 - precisa decidir se joga
      const teamBPlayers = room.game.players.filter((p) => p.team === "B");
      room.game.mãoDeOnze = {
        status: "pending",
        team: "B",
        deciders: teamBPlayers.map((p) => p.id),
        decisions: new Map(),
      };
    }
    // Se ambos estão em 11, é Mão de Ferro - jogo normal (sem decisão)

    // Primeiro jogador após o dealer
    room.game.currentTurnIndex = (room.game.dealerIndex + 1) % 4;
  }

  playCard(
    roomId: string,
    socketId: string,
    cardIndex: number
  ): { success: boolean; error?: string; card?: Card; vazaComplete?: boolean; vazaWinner?: Team | "draw" } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Sala não encontrada" };
    if (room.game.status !== "playing") return { success: false, error: "Jogo não iniciado" };
    if (room.game.mãoDeOnze && room.game.mãoDeOnze.status === "pending") {
      return { success: false, error: "Aguardando decisão de Mão de Onze" };
    }

    const currentPlayer = room.game.players[room.game.currentTurnIndex];
    if (currentPlayer.id !== socketId) {
      return { success: false, error: "Não é sua vez" };
    }

    if (cardIndex < 0 || cardIndex >= currentPlayer.hand.length) {
      return { success: false, error: "Carta inválida" };
    }

    const card = currentPlayer.hand.splice(cardIndex, 1)[0];
    room.game.currentVaza.push({ playerId: socketId, card });

    // Avançar turno
    room.game.currentTurnIndex = (room.game.currentTurnIndex + 1) % 4;

    // Verificar se a vaza está completa (todos jogaram)
    if (room.game.currentVaza.length === 4) {
      const winner = getVazaWinner(room.game.currentVaza, room.game.vira);

      let vazaWinner: Team | "draw" = "draw";
      if (winner) {
        const winnerPlayer = room.game.players.find(
          (p) => p.id === winner.playerId
        );
        if (winnerPlayer) {
          vazaWinner = winnerPlayer.team;
          room.game.vazaScores[vazaWinner]++;
        }
      }

      room.game.vazas.push({
        winner: vazaWinner,
        cards: [...room.game.currentVaza],
      });

      // Verificar se a mão acabou (melhor de 3 vazas)
      const vazaResult = { ...room.game.currentVaza };
      room.game.currentVaza = [];

      // Verificar se alguém já ganhou 2 vazas
      if (room.game.vazaScores.A >= 2 || room.game.vazaScores.B >= 2) {
        const mãoWinner = room.game.vazaScores.A >= 2 ? "A" : "B";
        room.game.scores[mãoWinner] += room.game.trucoLevel;

        // Verificar se o jogo acabou
        if (room.game.scores[mãoWinner] >= 12) {
          room.game.winner = mãoWinner;
          room.game.status = "finished";
        } else {
          // Próxima mão
          room.game.dealerIndex = (room.game.dealerIndex + 1) % 4;
          this.dealCards(room);
        }
      } else {
        // Próxima vaza - primeiro jogador é o vencedor da vaza anterior
        if (vazaWinner !== "draw" && winner) {
          const winnerIndex = room.game.players.findIndex(
            (p) => p.id === winner.playerId
          );
          if (winnerIndex !== -1) {
            room.game.currentTurnIndex = winnerIndex;
          }
        }
      }

      return {
        success: true,
        card,
        vazaComplete: true,
        vazaWinner,
      };
    }

    return { success: true, card };
  }

  requestTruco(
    roomId: string,
    socketId: string
  ): { success: boolean; error?: string; level?: number } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Sala não encontrada" };
    if (room.game.status !== "playing") return { success: false, error: "Jogo não iniciado" };

    if (room.game.trucoRequest) {
      return { success: false, error: "Já há um pedido de truco pendente" };
    }

    const currentLevel = room.game.trucoLevel;
    let nextLevel: number;

    if (currentLevel === 1) nextLevel = 3;
    else if (currentLevel === 3) nextLevel = 6;
    else if (currentLevel === 6) nextLevel = 9;
    else if (currentLevel === 9) nextLevel = 12;
    else return { success: false, error: "Aposta já está no máximo" };

    room.game.trucoRequest = { from: socketId, level: nextLevel };
    return { success: true, level: nextLevel };
  }

  respondTruco(
    roomId: string,
    socketId: string,
    accept: boolean
  ): { success: boolean; error?: string; accepted?: boolean; level?: number } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Sala não encontrada" };
    if (!room.game.trucoRequest) return { success: false, error: "Nenhum pedido de truco pendente" };

    const request = room.game.trucoRequest;
    const requester = room.game.players.find((p) => p.id === request.from);
    const responder = room.game.players.find((p) => p.id === socketId);

    if (requester && responder && requester.team === responder.team) {
      return {
        success: false,
        error: "Você não pode responder ao pedido do seu próprio time",
      };
    }

    room.game.trucoRequest = null;

    if (accept) {
      room.game.trucoLevel = request.level;
      return { success: true, accepted: true, level: request.level };
    } else {
      // Quem correu perde a mão
      const playerWhoRequested = room.game.players.find(
        (p) => p.id === request.from
      );
      if (!playerWhoRequested) return { success: false, error: "Jogador não encontrado" };

      const loserTeam = playerWhoRequested.team;
      const winnerTeam = loserTeam === "A" ? "B" : "A";

      // Quem correu perde o valor atual da aposta (não o nível pedido)
      room.game.scores[winnerTeam] += room.game.trucoLevel > 1 ? room.game.trucoLevel : 1;

      if (room.game.scores[winnerTeam] >= 12) {
        room.game.winner = winnerTeam;
        room.game.status = "finished";
      } else {
        // Próxima mão
        room.game.dealerIndex = (room.game.dealerIndex + 1) % 4;
        this.dealCards(room);
      }

      return { success: true, accepted: false, level: request.level };
    }
  }

  respondMãoDeOnze(
    roomId: string,
    socketId: string,
    accept: boolean
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Sala não encontrada" };
    if (!room.game.mãoDeOnze || room.game.mãoDeOnze.status !== "pending") {
      return { success: false, error: "Não há decisão de Mão de Onze pendente" };
    }

    const mão = room.game.mãoDeOnze;
    if (!mão.deciders.includes(socketId)) {
      return { success: false, error: "Você não precisa decidir" };
    }

    mão.decisions.set(socketId, accept);

    // Verificar se todos decidiram
    if (mão.decisions.size === mão.deciders.length) {
      const allAccepted = Array.from(mão.decisions.values()).every((v) => v);

      if (allAccepted) {
        mão.status = "accepted";
        return { success: true };
      } else {
        // Alguém recusou - oponente ganha 1 ponto
        mão.status = "rejected";
        const loserTeam = mão.team!;
        const winnerTeam = loserTeam === "A" ? "B" : "A";
        room.game.scores[winnerTeam] += 1;

        if (room.game.scores[winnerTeam] >= 12) {
          room.game.winner = winnerTeam;
          room.game.status = "finished";
        } else {
          // Próxima mão
          room.game.dealerIndex = (room.game.dealerIndex + 1) % 4;
          this.dealCards(room);
        }

        return { success: true };
      }
    }

    return { success: true };
  }

  removePlayer(socketId: string): { room: Room } | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.game.players.find((p) => p.id === socketId);
    if (player) {
      player.connected = false;
    }

    this.socketToRoom.delete(socketId);
    return { room };
  }

  reconnectPlayer(socketId: string, roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Encontrar jogador desconectado e reconectar
    for (const player of room.game.players) {
      if (!player.connected) {
        player.id = socketId;
        player.connected = true;
        this.socketToRoom.set(socketId, room.id);
        return room;
      }
    }

    return null;
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.game.players.forEach((p) => this.socketToRoom.delete(p.id));
      this.rooms.delete(roomId);
    }
  }
}
