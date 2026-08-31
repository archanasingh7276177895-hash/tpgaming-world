import { Routes } from '@angular/router';

// Component Imports
import { DashboardComponent } from './components/dashboard/dashboard';
import { AuthComponent } from './components/auth/auth';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard';
import { DepositComponent } from './components/deposit/deposit';
import { WithdrawalComponent } from './components/withdrawal/withdrawal';
import { TransactionsComponent } from './components/transactions/transactions';
import { GameHistoryComponent } from './components/game-history/game-history';
import { ChangePasswordComponent } from './components/change-password/change-password';

export const routes: Routes = [
  // Default Route
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  // User Views
  { path: 'dashboard', component: DashboardComponent },
  { path: 'auth', component: AuthComponent },
  { path: 'login', component: AuthComponent },
  { path: 'register', component: AuthComponent },

  // Passbook & Banking
  { path: 'deposit', component: DepositComponent },
  { path: 'withdrawal', component: WithdrawalComponent },
  { path: 'transactions', component: TransactionsComponent },

  // Game Records & Settings
  { path: 'game-history', component: GameHistoryComponent },
  { path: 'change-password', component: ChangePasswordComponent },

  // Admin Portal
  { path: 'admin', component: AdminDashboardComponent },

  // Fallback Wildcard
  { path: '**', redirectTo: 'dashboard' }
];