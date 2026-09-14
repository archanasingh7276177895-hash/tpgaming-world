import { Routes, Router, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';

// Component Imports
import { DashboardComponent } from './components/dashboard/dashboard';
import { AuthComponent } from './components/auth/auth';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard';
import { DepositComponent } from './components/deposit/deposit';
import { WithdrawalComponent } from './components/withdrawal/withdrawal';
import { TransactionsComponent } from './components/transactions/transactions';
import { GameHistoryComponent } from './components/game-history/game-history';
import { ChangePasswordComponent } from './components/change-password/change-password';

// Admin Route Guard (Blocks non-admin users)
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const userStr = localStorage.getItem('user');

  if (!userStr) {
    router.navigate(['/login']);
    return false;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role === 'admin') {
      return true; // Access granted
    }
  } catch (e) {
    console.error('Guard parse error:', e);
  }

  // Not an admin: redirect back to player dashboard
  router.navigate(['/dashboard']);
  return false;
};

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

  // Admin Portal (Protected with adminGuard)
  { 
    path: 'admin', 
    component: AdminDashboardComponent,
    canActivate: [adminGuard]
  },

  // Fallback Wildcard
  { path: '**', redirectTo: 'dashboard' }
];