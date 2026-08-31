const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const matchmakingQueues = {};
const activeRooms = {};

module.exports = function (io) {
  // Payout Helper that safely creates Transaction records
  async function resolveWinnerPayout(userId, amount, roomId, description) {
    if (!userId || amount <= 0) return;
    try {
      const user = await User.findById(userId);
      if (!user) return;

      const prevBal = user.balance ?? user.walletBalance ?? 0;
      const newBal = prevBal + amount;

      await User.updateOne(
        { _id: user._id },
        { $set: { balance: newBal, walletBalance: newBal } }
      );

      // Create Mongo Transaction Record
      await Transaction.create({
        userId: user._id.toString(),
        username: user.username,
        type: 'GAME_WIN',
        category: 'CREDIT',
        amount,
        previousBalance: prevBal,
        newBalance: newBal,
        status: 'SUCCESS',
        description,
        referenceId: roomId
      });

      console.log(`🏆 GAME WIN TRANSACTION SAVED: ₹${amount} credited to ${user.username} for ${roomId}`);

      const room = activeRooms[roomId];
      if (room) {
        const playerObj = room.players.find(p => (p.userId || '').toString() === userId.toString());
        if (playerObj) {
          const targetSocket = io.sockets.sockets.get(playerObj.socketId);
          if (targetSocket) {
            targetSocket.emit('balance_updated', { newBalance: newBal });
          }
        }
      }
    } catch (err) {
      console.error('PAYOUT RESOLUTION ERROR:', err);
    }
  }

  // Helper to handle match victory
  async function handleVictory(roomId, userId, reason) {
    const room = activeRooms[roomId];
    if (!room || room.status === 'COMPLETED') return;

    if (!room.winners.includes(userId.toString())) {
      room.winners.push(userId.toString());
    }

    const winnerPlayer = room.players.find(p => (p.userId || '').toString() === userId.toString());
    if (winnerPlayer) winnerPlayer.status = 'FINISHED';

    const rank = room.winners.length;
    const activeOngoingPlayers = room.players.filter(p => p.status === 'PLAYING');

    let victoryReason = reason;
    if (!victoryReason) {
      if (room.gameType === 'chess') victoryReason = 'Checkmate';
      else if (room.gameType === 'snakes') victoryReason = 'Tile 100 Reached';
      else if (room.gameType === 'ludo') victoryReason = 'All Tokens Home';
      else if (room.gameType === 'fruit') victoryReason = 'Highest Score / Bomb Avoided';
      else victoryReason = '1st Place Win';
    }

    if (room.playerMode === 2) {
      await resolveWinnerPayout(userId, room.prizePool, roomId, `${room.gameType.toUpperCase()} 2P Victory (${victoryReason})`);
      room.status = 'COMPLETED';

      const endPayload = {
        roomId,
        winnerUserId: userId,
        winnerUsername: winnerPlayer ? winnerPlayer.username : 'Winner',
        prizePool: room.prizePool,
        reason: victoryReason
      };

      io.to(roomId).emit('game_ended', endPayload);
      io.to(roomId).emit('gameEnded', endPayload);

      delete activeRooms[roomId];
    } else {
      if (rank === 1) {
        const firstPrize = room.entryFee * 2;
        await resolveWinnerPayout(userId, firstPrize, roomId, 'Ludo 4P 1st Place Victory');

        const rankPayload = {
          userId,
          username: winnerPlayer?.username,
          rank: 1,
          prize: firstPrize
        };
        io.to(roomId).emit('player_finished_rank', rankPayload);

        if (activeOngoingPlayers.length === 1) {
          const secondPlacePlayer = activeOngoingPlayers[0];
          const secondPrize = room.entryFee;
          await resolveWinnerPayout(secondPlacePlayer.userId, secondPrize, roomId, 'Ludo 4P 2nd Place Victory');

          room.status = 'COMPLETED';
          const endPayload = {
            roomId,
            winners: [userId, secondPlacePlayer.userId],
            winnerUsername: winnerPlayer?.username,
            prizePool: room.prizePool,
            reason: 'Top 2 Winners Completed'
          };
          io.to(roomId).emit('game_ended', endPayload);
          io.to(roomId).emit('gameEnded', endPayload);

          delete activeRooms[roomId];
        }
      } else if (rank === 2) {
        const secondPrize = room.entryFee;
        await resolveWinnerPayout(userId, secondPrize, roomId, 'Ludo 4P 2nd Place Victory');

        io.to(roomId).emit('player_finished_rank', {
          userId,
          username: winnerPlayer?.username,
          rank: 2,
          prize: secondPrize
        });

        room.status = 'COMPLETED';
        const endPayload = {
          roomId,
          winners: room.winners,
          winnerUsername: winnerPlayer?.username,
          prizePool: room.prizePool,
          reason: 'Top 2 Winners Completed'
        };
        io.to(roomId).emit('game_ended', endPayload);
        io.to(roomId).emit('gameEnded', endPayload);

        delete activeRooms[roomId];
      }
    }
  }

  // Helper to handle forfeit
  async function handleForfeit(roomId, forfeitUserId) {
    const room = activeRooms[roomId];
    if (!room || room.status === 'COMPLETED') return;

    const p = room.players.find(x => (x.userId || '').toString() === (forfeitUserId || '').toString());
    if (p) p.status = 'FORFEITED';

    const activeList = room.players.filter(x => x.status === 'PLAYING');

    if (activeList.length === 1 && room.winners.length === 0) {
      const winner = activeList[0];
      const prize = room.playerMode === 2 ? room.prizePool : (room.entryFee * 2);
      await resolveWinnerPayout(winner.userId, prize, roomId, 'Opponent Forfeited');

      room.status = 'COMPLETED';
      const endPayload = {
        roomId,
        winnerUserId: winner.userId,
        winnerUsername: winner.username,
        prizePool: prize,
        reason: 'Opponent Forfeited'
      };
      io.to(roomId).emit('game_ended', endPayload);
      io.to(roomId).emit('gameEnded', endPayload);

      delete activeRooms[roomId];
    } else {
      io.to(roomId).emit('player_forfeited_sync', { forfeitUserId });
    }
  }

  io.on('connection', (socket) => {
    // 1. JOIN MATCHMAKING
    socket.on('join_matchmaking', async (data) => {
      try {
        const { userId, username, gameType, playerMode, entryFee } = data;
        const fee = Number(entryFee) || 0;
        const requiredPlayers = Number(playerMode) === 4 || playerMode === '4P' ? 4 : 2;
        const queueKey = `${gameType}_${requiredPlayers}P_${fee}`;

        const user = await User.findById(userId);
        if (!user) return socket.emit('matchmaking_error', { message: 'User not found.' });

        const currentBalance = user.balance ?? user.walletBalance ?? 0;
        if (currentBalance < fee) {
          return socket.emit('matchmaking_error', { message: `Insufficient balance! Need ₹${fee}.` });
        }

        if (!matchmakingQueues[queueKey]) matchmakingQueues[queueKey] = [];

        const alreadyQueued = matchmakingQueues[queueKey].some((p) => p.userId.toString() === userId.toString());
        if (alreadyQueued) {
          return socket.emit('matchmaking_status', { status: 'WAITING', message: 'Already searching for match...' });
        }

        matchmakingQueues[queueKey].push({
          socketId: socket.id,
          userId: user._id.toString(),
          username: user.username
        });

        socket.emit('matchmaking_status', { 
          status: 'SEARCHING', 
          message: 'Searching for opponents...',
          queueCount: matchmakingQueues[queueKey].length,
          requiredPlayers 
        });

        if (matchmakingQueues[queueKey].length >= requiredPlayers) {
          const matchedPlayers = matchmakingQueues[queueKey].splice(0, requiredPlayers);
          const roomId = `ROOM_${gameType.toUpperCase()}_${Date.now()}`;

          const totalCollected = fee * requiredPlayers;
          let prizePoolDisplay = totalCollected;
          
          if (requiredPlayers === 2) {
            prizePoolDisplay = totalCollected - Math.round(totalCollected * 0.10);
          } else {
            prizePoolDisplay = (fee * 2) + fee;
          }

          for (const player of matchedPlayers) {
            const playerDoc = await User.findById(player.userId);
            const prevBal = playerDoc.balance ?? playerDoc.walletBalance ?? 0;
            const newBal = Math.max(0, prevBal - fee);

            await User.updateOne({ _id: player.userId }, { $set: { balance: newBal, walletBalance: newBal } });

            // Create GAME_FEE Transaction Record
            await Transaction.create({
              userId: player.userId.toString(),
              username: player.username,
              type: 'GAME_FEE',
              category: 'DEBIT',
              amount: fee,
              previousBalance: prevBal,
              newBalance: newBal,
              status: 'SUCCESS',
              description: `${gameType.toUpperCase()} ${requiredPlayers}P Entry Fee`,
              referenceId: roomId
            });

            console.log(`💸 GAME_FEE RECORDED: ₹${fee} from ${player.username} for ${roomId}`);

            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
              playerSocket.join(roomId);
              playerSocket.emit('balance_updated', { newBalance: newBal });
            }
          }

          activeRooms[roomId] = {
            roomId,
            gameType,
            playerMode: requiredPlayers,
            entryFee: fee,
            prizePool: prizePoolDisplay,
            players: matchedPlayers.map(p => ({ ...p, status: 'PLAYING' })),
            winners: [],
            status: 'PLAYING',
            startedAt: new Date()
          };

          const matchFoundData = {
            roomId,
            gameType,
            playerMode: requiredPlayers,
            entryFee: fee,
            prizePool: prizePoolDisplay,
            players: matchedPlayers.map(p => ({ userId: p.userId, username: p.username }))
          };

          io.to(roomId).emit('match_found', matchFoundData);
          io.to(roomId).emit('matchFound', matchFoundData);
        }
      } catch (err) {
        console.error('MATCHMAKING ERROR:', err);
        socket.emit('matchmaking_error', { message: 'Matchmaking failed.' });
      }
    });

    // 2. CANCEL MATCHMAKING
    socket.on('cancel_matchmaking', () => {
      for (const queueKey in matchmakingQueues) {
        matchmakingQueues[queueKey] = matchmakingQueues[queueKey].filter((p) => p.socketId !== socket.id);
      }
      socket.emit('matchmaking_cancelled', { message: 'Cancelled.' });
    });

    // 3. IN-GAME ACTION BROADCAST (Both formats)
    socket.on('game_action', (payload) => {
      const { roomId, action, data } = payload || {};
      if (roomId) {
        socket.to(roomId).emit('game_action_received', { action, data, senderSocketId: socket.id });
        socket.to(roomId).emit('onGameAction', { action, data });
      }
    });

    socket.on('gameAction', ({ roomId, action, data }) => {
      if (roomId) {
        socket.to(roomId).emit('game_action_received', { action, data, senderSocketId: socket.id });
        socket.to(roomId).emit('onGameAction', { action, data });
      }
    });

    // 4. RANK / VICTORY LISTENERS
    socket.on('player_rank_achieved', async ({ roomId, userId, reason }) => {
      await handleVictory(roomId, userId, reason);
    });

    socket.on('claimRank', async (data) => {
      const roomId = data?.roomId;
      const userId = data?.winnerUserId || data?.userId;
      const reason = data?.reason;
      await handleVictory(roomId, userId, reason);
    });

    // 5. PLAYER ELIMINATED
    socket.on('player_eliminated', async ({ roomId, userId, username }) => {
      const room = activeRooms[roomId];
      if (!room || room.status === 'COMPLETED') return;

      const p = room.players.find(x => (x.userId || '').toString() === (userId || '').toString());
      if (p) p.status = 'ELIMINATED';

      const remainingPlaying = room.players.filter(x => x.status === 'PLAYING');

      io.to(roomId).emit('player_eliminated_sync', {
        userId,
        username,
        remainingCount: remainingPlaying.length
      });

      if (remainingPlaying.length === 1 && room.winners.length === 0) {
        const lastPlayer = remainingPlaying[0];
        const prize = room.playerMode === 2 ? room.prizePool : (room.entryFee * 2);
        await resolveWinnerPayout(lastPlayer.userId, prize, roomId, 'Opponents Eliminated');

        room.status = 'COMPLETED';
        const endPayload = {
          roomId,
          winnerUserId: lastPlayer.userId,
          winnerUsername: lastPlayer.username,
          prizePool: prize,
          reason: 'All opponents eliminated'
        };
        io.to(roomId).emit('game_ended', endPayload);
        io.to(roomId).emit('gameEnded', endPayload);

        delete activeRooms[roomId];
      }
    });

    // 6. FORFEIT / QUIT LISTENERS
    socket.on('forfeit_match', async ({ roomId, forfeitUserId }) => {
      await handleForfeit(roomId, forfeitUserId);
    });

    socket.on('forfeitMatch', async (data) => {
      const roomId = data?.roomId;
      const forfeitUserId = data?.userId || data?.forfeitUserId;
      await handleForfeit(roomId, forfeitUserId);
    });

    // 7. DISCONNECT
    socket.on('disconnect', async () => {
      for (const queueKey in matchmakingQueues) {
        matchmakingQueues[queueKey] = matchmakingQueues[queueKey].filter((p) => p.socketId !== socket.id);
      }
      for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        const leaving = room.players.find(p => p.socketId === socket.id);
        if (leaving && room.status === 'PLAYING') {
          leaving.status = 'DISCONNECTED';
          const activeList = room.players.filter(x => x.status === 'PLAYING');
          if (activeList.length === 1 && room.winners.length === 0) {
            const winner = activeList[0];
            const prize = room.playerMode === 2 ? room.prizePool : (room.entryFee * 2);
            await resolveWinnerPayout(winner.userId, prize, roomId, 'Opponent Disconnected');
            room.status = 'COMPLETED';

            const endPayload = {
              roomId,
              winnerUserId: winner.userId,
              winnerUsername: winner.username,
              prizePool: prize,
              reason: 'Opponent Disconnected'
            };
            io.to(roomId).emit('game_ended', endPayload);
            io.to(roomId).emit('gameEnded', endPayload);

            delete activeRooms[roomId];
          }
        }
      }
    });
  });
};