import type { Me } from "../../shared/api";

/** What the group page's panels share when an action changes the caller's view. */

/**
 * What happened after an action, and which control (by `data-focus`) keeps the focus;
 * `fallback` when that control is gone from the fresh view.
 */
export interface AfterAction {
  status: string;
  focus?: string;
  fallback?: string;
}

/** How the group page shows the caller's fresh view after an action; with `token` when this device's token changed. */
export type Rerender = (me: Me, after: AfterAction, token?: string) => void;

/**
 * With `data-confirm`, the first press arms the button and says so in `status`; only a second
 * press within 5 seconds calls `act`. Without it, every press acts.
 */
export function onConfirmedClick(button: HTMLButtonElement, status: HTMLElement, act: () => void): void {
  const label = button.textContent!;
  let disarm: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    clearTimeout(disarm);
    delete button.dataset.armed;
    button.textContent = label;
  };
  button.addEventListener("blur", reset);

  button.addEventListener("click", () => {
    if (button.dataset.confirm && !button.dataset.armed) {
      button.dataset.armed = "true";
      button.textContent = button.dataset.confirm;
      status.textContent = `${button.getAttribute("aria-label")}? Zum Bestätigen noch einmal tippen.`;
      disarm = setTimeout(reset, 5000);
      return;
    }
    reset();
    act();
  });
}

/**
 * A click on the backdrop cancels a dialog too, unless `canClose` says no. It lands on the
 * dialog itself, as does one on its padding, so check where.
 */
export function closeOnBackdropClick(dialog: HTMLDialogElement, canClose: () => boolean = () => true): void {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog || !canClose()) return;
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });
}
