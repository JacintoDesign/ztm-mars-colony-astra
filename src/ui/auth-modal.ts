export interface AuthModalHandlers {
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  onGuestSignIn: () => Promise<{ error: string | null }>;
}

export class AuthModal {
  private container: HTMLElement;
  private mode: 'signin' | 'signup' = 'signin';
  private handlers: AuthModalHandlers;

  constructor(handlers: AuthModalHandlers) {
    this.handlers = handlers;
    this.container = document.createElement('div');
    this.container.id = 'auth-modal-overlay';
    this.container.className = 'auth-modal-overlay';
    document.body.appendChild(this.container);
    this.render();
  }

  public show(): void {
    this.container.style.display = 'flex';
    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public setStatus(message: string, isError = false): void {
    const statusEl = this.container.querySelector<HTMLElement>('#auth-status-msg');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = isError ? 'auth-status-msg auth-status-error' : 'auth-status-msg auth-status-info';
    }
  }

  private setMode(mode: 'signin' | 'signup'): void {
    this.mode = mode;
    this.render();
  }

  private render(): void {
    const isSignIn = this.mode === 'signin';
    const primaryButtonText = isSignIn ? 'AUTHENTICATE & ENTER COLONY' : 'REGISTER & ESTABLISH COLONY';

    this.container.innerHTML = `
      <div class="auth-modal-panel">
        <div class="auth-modal-header">
          <div class="auth-modal-title">// MARS TELEMETRY AUTHENTICATION</div>
          <div class="auth-modal-subtitle">MISSION CONTROL ACCESS PORTAL</div>
        </div>

        <div class="auth-mode-selector">
          <button type="button" id="tab-signin" class="auth-tab-btn ${isSignIn ? 'active' : ''}">SIGN IN</button>
          <button type="button" id="tab-signup" class="auth-tab-btn ${!isSignIn ? 'active' : ''}">SIGN UP</button>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="auth-input-group">
            <label for="auth-email" class="auth-label">OPERATOR EMAIL</label>
            <input
              id="auth-email"
              type="email"
              class="auth-input"
              placeholder="operator@station.mars"
              required
              autocomplete="email"
            />
          </div>

          <div class="auth-input-group">
            <label for="auth-password" class="auth-label">ACCESS KEY / PASSWORD</label>
            <input
              id="auth-password"
              type="password"
              class="auth-input"
              placeholder="••••••••••••"
              required
              minlength="6"
              autocomplete="${isSignIn ? 'current-password' : 'new-password'}"
            />
          </div>

          <div id="auth-status-msg" class="auth-status-msg"></div>

          <button type="submit" id="auth-submit-btn" class="auth-btn auth-btn-primary">
            ${primaryButtonText}
          </button>

          <div class="auth-divider">
            <span>OR TEMPORARY ACCESS</span>
          </div>

          <button type="button" id="auth-guest-btn" class="auth-btn auth-btn-guest">
            PLAY AS GUEST (ANONYMOUS UPLINK)
          </button>
        </form>
      </div>
    `;

    // Bind event handlers
    const tabSignIn = this.container.querySelector<HTMLButtonElement>('#tab-signin');
    const tabSignUp = this.container.querySelector<HTMLButtonElement>('#tab-signup');
    const form = this.container.querySelector<HTMLFormElement>('#auth-form');
    const guestBtn = this.container.querySelector<HTMLButtonElement>('#auth-guest-btn');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('#auth-submit-btn');

    tabSignIn?.addEventListener('click', () => this.setMode('signin'));
    tabSignUp?.addEventListener('click', () => this.setMode('signup'));

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = this.container.querySelector<HTMLInputElement>('#auth-email');
      const passwordInput = this.container.querySelector<HTMLInputElement>('#auth-password');
      const email = emailInput?.value.trim() ?? '';
      const password = passwordInput?.value ?? '';

      if (!email || !password) {
        this.setStatus('Email and password required', true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (guestBtn) guestBtn.disabled = true;
      this.setStatus('Authenticating with station uplink...', false);

      const result = isSignIn
        ? await this.handlers.onSignIn(email, password)
        : await this.handlers.onSignUp(email, password);

      if (result.error) {
        this.setStatus(result.error, true);
        if (submitBtn) submitBtn.disabled = false;
        if (guestBtn) guestBtn.disabled = false;
      } else if (!isSignIn && 'needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        this.setStatus(
          'Registration recorded. Email confirmation is required by Mission Control before sign-in. Use "Play as Guest" for instant access.',
          false
        );
        if (submitBtn) submitBtn.disabled = false;
        if (guestBtn) guestBtn.disabled = false;
      } else {
        this.setStatus('Authentication successful. Initializing telemetry...', false);
      }
    });

    guestBtn?.addEventListener('click', async () => {
      if (submitBtn) submitBtn.disabled = true;
      if (guestBtn) guestBtn.disabled = true;
      this.setStatus('Establishing anonymous guest uplink...', false);

      const result = await this.handlers.onGuestSignIn();
      if (result.error) {
        this.setStatus(result.error, true);
        if (submitBtn) submitBtn.disabled = false;
        if (guestBtn) guestBtn.disabled = false;
      } else {
        this.setStatus('Guest session verified. Loading colony...', false);
      }
    });
  }
}
