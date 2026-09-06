export type TelemetryBannerState = 'hidden' | 'reconnecting' | 'offline';

export class TelemetryBanner {
  private container: HTMLElement;
  private currentState: TelemetryBannerState = 'hidden';
  public static readonly CONTAINER_ID = 'telemetry-banner';

  constructor() {
    let el = document.getElementById(TelemetryBanner.CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TelemetryBanner.CONTAINER_ID;
      el.className = 'telemetry-banner banner-hidden';
      el.style.display = 'none';
      document.body.appendChild(el);
    } else {
      el.style.display = 'none';
      el.className = 'telemetry-banner banner-hidden';
    }
    this.container = el;
    this.render();
  }

  public setState(state: TelemetryBannerState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.render();
  }

  public getState(): TelemetryBannerState {
    return this.currentState;
  }

  private render(): void {
    if (this.currentState === 'hidden') {
      this.container.style.display = 'none';
      this.container.className = 'telemetry-banner banner-hidden';
      this.container.innerHTML = '';
      return;
    }

    this.container.style.display = 'flex';

    if (this.currentState === 'reconnecting') {
      this.container.className = 'telemetry-banner banner-reconnecting';
      this.container.innerHTML = `
        <div class="telemetry-banner-content">
          <span class="telemetry-banner-pulse-dot"></span>
          <span class="telemetry-banner-text">Re-establishing Uplink...</span>
        </div>
      `;
    } else if (this.currentState === 'offline') {
      this.container.className = 'telemetry-banner banner-offline';
      this.container.innerHTML = `
        <div class="telemetry-banner-content">
          <span class="telemetry-banner-warning-icon">⚠</span>
          <span class="telemetry-banner-text">Telemetry Lost - Actions Paused</span>
        </div>
      `;
    }
  }
}
