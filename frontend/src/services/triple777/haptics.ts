class HapticsController {
  private enabled = true;

  spin(): void {
    if (!this.enabled || !navigator.vibrate) return;
    try {
      navigator.vibrate(25);
    } catch {}
  }

  reelStop(): void {
    if (!this.enabled || !navigator.vibrate) return;
    try {
      navigator.vibrate(15);
    } catch {}
  }

  win(): void {
    if (!this.enabled || !navigator.vibrate) return;
    try {
      navigator.vibrate([40, 60, 80]);
    } catch {}
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }
}

export const haptics = new HapticsController();
