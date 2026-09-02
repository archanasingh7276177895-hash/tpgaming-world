import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly SOCKET_URL = 'https://tpgaming-world.onrender.com';

  get rawSocket(): Socket | null {
    return this.socket;
  }

  connect(): void {
    if (!this.socket) {
      this.socket = io(this.SOCKET_URL, {
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('⚡ [Socket] Connected:', this.socket?.id);
      });

      this.socket.on('disconnect', (reason) => {
        console.warn('⚠️ [Socket] Disconnected:', reason);
      });
    } else if (this.socket.disconnected) {
      this.socket.connect();
    }
  }

  // --- EMITTERS ---

  joinMatchmaking(payload: { userId: string; username: string; gameType: string; playerMode: number | string; entryFee: number }): void {
    this.socket?.emit('join_matchmaking', payload);
  }

  cancelMatchmaking(): void {
    this.socket?.emit('cancel_matchmaking');
  }

  sendGameAction(roomId: string, action: string, data: any): void {
    this.socket?.emit('game_action', { roomId, action, data });
  }

  claimVictory(roomId: string, winnerUserId: string, reason: string = 'Victory Achieved'): void {
    this.socket?.emit('player_rank_achieved', { roomId, userId: winnerUserId, reason });
  }

  claimRank(roomId: string, userId: string, reason?: string): void {
    this.socket?.emit('player_rank_achieved', { roomId, userId, reason });
  }

  eliminatePlayer(roomId: string, userId: string, username: string): void {
    this.socket?.emit('player_eliminated', { roomId, userId, username });
  }

  forfeitMatch(roomId: string, forfeitUserId: string): void {
    this.socket?.emit('forfeit_match', { roomId, forfeitUserId });
  }

  // --- LISTENERS (With proper cleanup) ---

  onMatchmakingStatus(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('matchmaking_status', handler);
      return () => this.socket?.off('matchmaking_status', handler);
    });
  }

  onMatchFound(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('match_found', handler);
      return () => this.socket?.off('match_found', handler);
    });
  }

  onMatchmakingError(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('matchmaking_error', handler);
      return () => this.socket?.off('matchmaking_error', handler);
    });
  }

  onMatchmakingCancelled(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('matchmaking_cancelled', handler);
      return () => this.socket?.off('matchmaking_cancelled', handler);
    });
  }

  onGameAction(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('game_action_received', handler);
      return () => this.socket?.off('game_action_received', handler);
    });
  }

  onPlayerRank(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('player_finished_rank', handler);
      return () => this.socket?.off('player_finished_rank', handler);
    });
  }

  onPlayerEliminated(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('player_eliminated_sync', handler);
      return () => this.socket?.off('player_eliminated_sync', handler);
    });
  }

  onGameEnded(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('game_ended', handler);
      return () => this.socket?.off('game_ended', handler);
    });
  }

  onBalanceUpdated(): Observable<any> {
    return new Observable((observer) => {
      const handler = (data: any) => observer.next(data);
      this.socket?.on('balance_updated', handler);
      return () => this.socket?.off('balance_updated', handler);
    });
  }
}