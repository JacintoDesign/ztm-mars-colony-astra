import { AuthState } from '../services/auth-manager';

export interface HeaderBarHandlers {
  onSignOut: () => Promise<void>;
  onUpgradeAccount?: (email: string, password: string) => Promise<{ error: string | null }>;
}

export class HeaderBar {
  private container: HTMLElement;
  private handlers: HeaderBarHandlers;
  private currentAuthState: AuthState | null = null;
  private isUpgradeModalOpen = false;

  constructor(handlers: HeaderBarHandlers) {
    this.handlers = handlers;
    this.container = document.createElement('div');
    this.container.id = 'header-bar';
    this.container.className = 'header-bar';
    document.body.appendChild(this.container);
    this.render();
  }

  public updateAuth(authState: AuthState): void {
    this.currentAuthState = authState;
    this.render();
  }

  public show(): void {
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private render(): void {
    if (!this.currentAuthState?.user) {
      this.container.style.display = 'none';
      this.container.innerHTML = '';
      return;
    }

    this.container.style.display = 'flex';
    const user = this.currentAuthState.user;
    const isGuest = this.currentAuthState.isGuest;
    const userLabel = isGuest
      ? `GUEST [${user.id.slice(0, 8)}]`
      : (user.email ?? user.id.slice(0, 8));

    const upgradeBtnHtml = isGuest
      ? `<button type="button" id="header-upgrade-btn" class="header-btn header-btn-upgrade">UPGRADE ACCOUNT</button>`
      : '';

    this.container.innerHTML = `
      <div class="header-user-badge">
        <span class="header-badge-label">UPLINK:</span>
        <span class="header-badge-user ${isGuest ? 'badge-guest' : 'badge-permanent'}">${userLabel}</span>
      </div>
      <div class="header-actions">
        ${upgradeBtnHtml}
        <button type="button" id="header-signout-btn" class="header-btn header-btn-signout">SIGN OUT</button>
      </div>
      ${this.isUpgradeModalOpen ? this.renderUpgradeModal() : ''}
    `;

    const signoutBtn = this.container.querySelector<HTMLButtonElement>('#header-signout-btn');
    signoutBtn?.addEventListener('click', async () => {
      if (signoutBtn) signoutBtn.disabled = true;
      await this.handlers.onSignOut();
    });

    const upgradeBtn = this.container.querySelector<HTMLButtonElement>('#header-upgrade-btn');
    upgradeBtn?.addEventListener('click', () => {
      this.isUpgradeModalOpen = true;
      this.render();
    });

    if (this.isUpgradeModalOpen) {
      this.bindUpgradeEvents();
    }
  }

  private renderUpgradeModal(): string {
    return `
      <div class="upgrade-modal-backdrop">
        <div class="upgrade-modal-box">
          <div class="upgrade-modal-header">// UPGRADE GUEST TO PERMANENT ACCOUNT</div>
          <div class="upgrade-modal-sub">Retain your current colony state and associate with permanent login credentials.</div>
          <form id="upgrade-form" class="upgrade-form">
            <div class="auth-input-group">
              <label class="auth-label" for="upgrade-email">EMAIL</label>
              <input id="upgrade-email" type="email" class="auth-input" placeholder="operator@station.mars" required />
            </div>
            <div class="auth-input-group">
              <label class="auth-label" for="upgrade-password">PASSWORD</label>
              <input id="upgrade-password" type="password" class="auth-input" placeholder="••••••••••••" required minlength="6" />
            </div>
            <div id="upgrade-status" class="auth-status-msg"></div>
            <div class="upgrade-actions">
              <button type="submit" id="upgrade-confirm-btn" class="auth-btn auth-btn-primary">CONFIRM UPGRADE</button>
              <button type="button" id="upgrade-cancel-btn" class="auth-btn auth-btn-guest">CANCEL</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private bindUpgradeEvents(): void {
    const cancelBtn = this.container.querySelector<HTMLButtonElement>('#upgrade-cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      this.isUpgradeModalOpen = false;
      this.render();
    });

    const form = this.container.querySelector<HTMLFormElement>('#upgrade-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (this.container.querySelector<HTMLInputElement>('#upgrade-email')?.value ?? '').trim();
      const password = this.container.querySelector<HTMLInputElement>('#upgrade-password')?.value ?? '';
      const statusEl = this.container.querySelector<HTMLElement>('#upgrade-status');

      if (!email || !password) {
        if (statusEl) {
          statusEl.textContent = 'Email and password required';
          statusEl.className = 'auth-status-msg auth-status-error';
        }
        return;
      }

      if (this.handlers.onUpgradeAccount) {
        if (statusEl) {
          statusEl.textContent = 'Upgrading account credentials...';
          statusEl.className = 'auth-status-msg auth-status-info';
        }
        const res = await this.handlers.onUpgradeAccount(email, password);
        if (res.error) {
          if (statusEl) {
            statusEl.textContent = res.error;
            statusEl.className = 'auth-status-msg auth-status-error';
          }
        } else {
          this.isUpgradeModalOpen = false;
          this.render();
        }
      }
    });
  }
}
