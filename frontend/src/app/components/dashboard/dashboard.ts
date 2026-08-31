import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent {
  @Input() username: string = 'Gamer';
  @Input() userRole: string = 'user';
  @Output() launchGame = new EventEmitter<any>();

  boardEntryFees: number[] = [10, 20, 50, 100];
  chessEntryFees: number[] = [10, 50, 100];
  fruitEntryFees: number[] = [5, 10, 20];

  matchType: { [key: string]: 'bot' | 'live' } = {
    'ludo': 'live',
    'snakes': 'live',
    'chess': 'live',
    'fruit': 'live'
  };

  gameModes: { [key: string]: '2P' | '4P' } = {
    'ludo': '2P',
    'snakes': '2P'
  };

  selectedFees: { [key: string]: number } = {
    'ludo': 10,
    'snakes': 10,
    'chess': 10,
    'fruit': 5
  };

  selectMatchType(gameKey: string, type: 'bot' | 'live') {
    if (this.userRole === 'admin' && type === 'live') {
      alert('Admin accounts can only play in Practice / vs Computer mode.');
      return;
    }
    this.matchType[gameKey] = type;
  }

  selectMode(gameKey: string, mode: '2P' | '4P') {
    this.gameModes[gameKey] = mode;
  }

  selectFee(gameKey: string, fee: number) {
    this.selectedFees[gameKey] = Number(fee);
  }

  startGame(gameKey: string) {
    const isBotMode = this.userRole === 'admin' || this.matchType[gameKey] === 'bot';

    const rawMode = (gameKey === 'chess' || gameKey === 'fruit') ? '2P' : this.gameModes[gameKey];
    const playerModeNumber = rawMode === '4P' ? 4 : 2;
    const fee = isBotMode ? 0 : Number(this.selectedFees[gameKey] || 10);

    this.launchGame.emit({
      game: gameKey,
      gameType: gameKey,
      players: rawMode,
      playerMode: playerModeNumber,
      fee: fee,
      entryFee: fee,
      mode: isBotMode ? 'bot' : 'live'
    });
  }
}