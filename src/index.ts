import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { RoomManager } from "./RoomManager";
import { ClientToServerEvents, ServerToClientEvents } from "./shared/types";

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

const roomManager = new RoomManager();
const disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on("create-room", ({ nickname }) => {
    const room = roomManager.createRoom(socket.id, nickname);
    socket.join(room.id);
    socket.emit("room-created", { roomId: room.id, code: room.code });
    io.to(room.id).emit("room-updated", room);
  });

  socket.on("join-room", ({ code, nickname, team }) => {
    const result = roomManager.joinRoom(code, socket.id, nickname, team);
    if ("error" in result) {
      socket.emit("room-error", result.error);
      return;
    }

    socket.join(result.room.id);

    // Cancelar timer de desconexão se existir
    const timer = disconnectTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(socket.id);
    }

    socket.emit("room-joined", { roomId: result.room.id });
    io.to(result.room.id).emit("room-updated", result.room);
  });

  socket.on("start-game", () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      socket.emit("room-error", "Sala não encontrada");
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit("room-error", "Apenas o host pode iniciar o jogo");
      return;
    }

    if (!roomManager.canStartGame(room.id)) {
      socket.emit("room-error", "Necessário 2 jogadores por time (4 no total)");
      return;
    }

    const game = roomManager.startGame(room.id);
    if (game) {
      io.to(room.id).emit("game-started", game);
      io.to(room.id).emit("room-updated", room);

      // Notificar sobre Mão de Onze se aplicável
      if (game.mãoDeOnze && game.mãoDeOnze.status === "pending") {
        io.to(room.id).emit("mão-de-onze", {
          team: game.mãoDeOnze.team!,
        });
      }
    }
  });

  socket.on("play-card", ({ cardIndex }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      socket.emit("room-error", "Sala não encontrada");
      return;
    }

    const result = roomManager.playCard(room.id, socket.id, cardIndex);
    if (!result.success) {
      socket.emit("room-error", result.error || "Erro ao jogar carta");
      return;
    }

    if (result.card) {
      io.to(room.id).emit("card-played", {
        playerId: socket.id,
        card: result.card,
      });
    }

    if (result.vazaComplete) {
      io.to(room.id).emit("vaza-result", {
        winner: result.vazaWinner || "draw",
        cards: room.game.vazas[room.game.vazas.length - 1]?.cards || [],
      });

      // Se a mão acabou, enviar evento de mão encerrada
      if (room.game.winner) {
        io.to(room.id).emit("mão-ended", {
          winner: room.game.winner,
          scores: room.game.scores,
        });
        if (room.game.status === "finished") {
          io.to(room.id).emit("room-closed", `Jogo encerrado! Time ${room.game.winner} venceu!`);
        }
      } else if (room.game.mãoDeOnze && room.game.mãoDeOnze.status === "pending") {
        // Nova mão com Mão de Onze
        io.to(room.id).emit("mão-de-onze", {
          team: room.game.mãoDeOnze.team!,
        });
      }
    }

    io.to(room.id).emit("game-updated", room.game);
  });

  socket.on("request-truco", () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      socket.emit("room-error", "Sala não encontrada");
      return;
    }

    const result = roomManager.requestTruco(room.id, socket.id);
    if (!result.success) {
      socket.emit("room-error", result.error || "Erro ao pedir truco");
      return;
    }

    io.to(room.id).emit("truco-requested", {
      from: socket.id,
      level: result.level!,
    });
  });

  socket.on("respond-truco", ({ accept }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      socket.emit("room-error", "Sala não encontrada");
      return;
    }

    const result = roomManager.respondTruco(room.id, socket.id, accept);
    if (!result.success) {
      socket.emit("room-error", result.error || "Erro ao responder truco");
      return;
    }

    io.to(room.id).emit("truco-responded", {
      accepted: result.accepted!,
      level: result.level!,
    });

    io.to(room.id).emit("game-updated", room.game);

    if (room.game.status === "finished") {
      io.to(room.id).emit("room-closed", `Jogo encerrado! Time ${room.game.winner} venceu!`);
    }
  });

  socket.on("respond-mão-de-onze", ({ accept }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) {
      socket.emit("room-error", "Sala não encontrada");
      return;
    }

    const result = roomManager.respondMãoDeOnze(room.id, socket.id, accept);
    if (!result.success) {
      socket.emit("room-error", result.error || "Erro ao responder Mão de Onze");
      return;
    }

    io.to(room.id).emit("game-updated", room.game);

    if (room.game.status === "finished") {
      io.to(room.id).emit("room-closed", `Jogo encerrado! Time ${room.game.winner} venceu!`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);

    const result = roomManager.removePlayer(socket.id);
    if (result) {
      const room = result.room;
      io.to(room.id).emit("player-disconnected", {
        playerId: socket.id,
        timeout: 30,
      });

      // Iniciar timer de 30s para encerrar a sala
      const timer = setTimeout(() => {
        roomManager.removeRoom(room.id);
        io.to(room.id).emit("room-closed", "Jogador desconectado. Sala encerrada.");
        disconnectTimers.delete(socket.id);
      }, 30000);

      disconnectTimers.set(socket.id, timer);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
