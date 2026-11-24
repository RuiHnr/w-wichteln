/** Copies the text of a read-only field; falls back to selecting it where the clipboard API is refused. */
export async function copyText(input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(input.value);
    return true;
  } catch {
    input.select();
    return document.execCommand("copy");
  }
}
