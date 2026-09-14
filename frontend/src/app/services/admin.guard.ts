import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

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
      return true; // Allowed
    }
  } catch (e) {
    // Corrupted user storage
  }

  // Not an admin: boot back to regular player dashboard
  router.navigate(['/dashboard']);
  return false;
};