import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

// Components
import { NavbarComponent } from './components/navbar/navbar';
import { AuthComponent } from './components/auth/auth';
import { DashboardComponent } from './components/dashboard/dashboard';
import { DepositComponent } from './components/deposit/deposit';
import { WithdrawalComponent } from './components/withdrawal/withdrawal';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard';
import { TransactionsComponent } from './components/transactions/transactions';
import { GameHistoryComponent } from './components/game-history/game-history';
import { ChangePasswordComponent } from './components/change-password/change-password';
import { MatchmakingModalComponent } from './components/matchmaking-modal/matchmaking-modal';
import { GameArenaComponent } from './components/game-arena/game-arena';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    AuthComponent,
    DashboardComponent,
    DepositComponent,
    WithdrawalComponent,
    AdminDashboardComponent,
    TransactionsComponent,
    GameHistoryComponent,
    ChangePasswordComponent,
    MatchmakingModalComponent,
    GameArenaComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  isLoggedIn: boolean = false;
  username: string = '';
  userRole: string = 'user';
  userBalance: number = 0;
  currentUser: any = null;
  currentPage: string = 'dashboard';

  activeMatchmakingConfig: any = null;
  activeMatchRoom: any = null;

  constructor(private socketService: SocketService) {}

  ngOnInit() {
    this.socketService.connect();
    this.checkLoginStatus();

    this.socketService.onBalanceUpdated().subscribe((res: any) => {
      if (res && res.newBalance !== undefined && res.username === this.username) {
        this.userBalance = Number(res.newBalance);

        if (this.currentUser) {
          this.currentUser.walletBalance = this.userBalance;
          this.currentUser.balance = this.userBalance;
          localStorage.setItem('user', JSON.stringify(this.currentUser));
        }
      }
    });
  }

  checkLoginStatus() {
    const token = localStorage.getItem('token') || localStorage.getItem('jwt');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      this.isLoggedIn = true;
      this.currentUser = JSON.parse(userStr);
      this.username = this.currentUser.username || this.currentUser.userId || 'Player';
      this.userRole = this.currentUser.role || 'user';
      this.userBalance = this.currentUser.walletBalance ?? this.currentUser.balance ?? 0;

      if (this.userRole === 'admin') {
        this.currentPage = 'admin';
      } else {
        this.currentPage = 'dashboard';
      }
    } else {
      this.isLoggedIn = false;
    }
  }

  onNavigate(page: string) {
    this.currentPage = page;
  }

  onLoginSuccess() {
    this.checkLoginStatus();
    this.socketService.connect();
  }

  onLogout() {
    this.isLoggedIn = false;
    this.userRole = 'user';
    this.currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    this.currentPage = 'dashboard';
  }

  onLaunchGame(gameData: any) {
    console.log('🎮 Launch Game Payload Received:', gameData);

    const gameType = (gameData?.gameType || gameData?.game || 'ludo').toLowerCase();
    const isBotMatch = this.userRole === 'admin' || gameData?.mode === 'bot' || Number(gameData?.fee || 0) === 0;

    const rawMode = gameData?.playerMode ?? gameData?.players ?? gameData?.mode;
    const playerMode = Number(rawMode) === 4 ? 4 : 2;

    // BOT / ADMIN PRACTICE MODE: Immediate launch without socket matchmaking
    if (isBotMatch) {
      const myId = (this.currentUser?._id || this.currentUser?.id || 'player_user').toString();

      this.activeMatchRoom = {
        roomId: `BOT_${gameType.toUpperCase()}_${Date.now().toString().slice(-6)}`,
        gameType: gameType,
        playerMode: playerMode,
        entryFee: 0,
        prizePool: 0,
        isBotMatch: true,
        players: [
          {
            userId: myId,
            username: this.userRole === 'admin' ? `${this.username} (Admin)` : this.username,
            isBot: false
          },
          {
            userId: 'bot_computer_player',
            username: 'AI Computer 🤖',
            isBot: true
          }
        ]
      };

      this.activeMatchmakingConfig = null;
      this.currentPage = 'game';
      return;
    }

    // REAL-TIME USER MATCHMAKING
    const rawFee = gameData?.entryFee ?? gameData?.selectedFee ?? gameData?.fee ?? gameData?.stake ?? gameData?.amount;
    const selectedFee = Number(rawFee) > 0 ? Number(rawFee) : 10;

    this.activeMatchmakingConfig = {
      gameType,
      playerMode,
      entryFee: selectedFee
    };
  }

  onMatchReady(roomData: any) {
    this.activeMatchRoom = roomData;
    this.activeMatchmakingConfig = null;
    this.currentPage = 'game';
  }

  onExitGame() {
    this.activeMatchRoom = null;
    this.currentPage = 'dashboard';
  }
}