import type { MessageAction } from "@/types";

export function sendMessage<T = unknown>(message: MessageAction): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((response ?? {}) as T);
    });
  });
}
