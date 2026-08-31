import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css'
})
export class AuthComponent {
  @Output() loginSuccess = new EventEmitter<void>();

  isLoginMode: boolean = true;
  username: string = '';
  userId: string = '';
  password: string = '';
  errorMessage: string = '';
  loading: boolean = false;

  constructor(private authService: AuthService) {}

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
  }

  onSubmit() {
    this.errorMessage = '';
    this.loading = true;

    if (this.isLoginMode) {
      this.authService.login({ userId: this.userId, password: this.password }).subscribe({
        next: (res: any) => {
          this.loading = false;
          // Store token and user object in local storage
          localStorage.setItem('token', res.token);
          localStorage.setItem('user', JSON.stringify(res.user));
          this.loginSuccess.emit();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || 'Login failed. Please check your credentials.';
        }
      });
    } else {
      this.authService.register({ username: this.username, userId: this.userId, password: this.password }).subscribe({
        next: () => {
          this.isLoginMode = true;
          this.loading = false;
          alert('Registration successful! Please login.');
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || 'Registration failed.';
        }
      });
    }
  }
}