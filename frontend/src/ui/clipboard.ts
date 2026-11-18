// Copy text to the clipboard. The browser can refuse (no permission, a page not served over https), and an
// unhandled refusal used to open the crash dialog: say so in a toast instead and report it to the caller.
import { notify } from "./notify";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    notify.error("Couldn't copy — the browser refused clipboard access");
    return false;
  }
}
