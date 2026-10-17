import { persisted } from "./state";
import type { Workspace } from "./state";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mathbuddy-draft", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadDraft(): Promise<Workspace | undefined> {
  const db = await database();
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db
        .transaction("drafts")
        .objectStore("drafts")
        .get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("steps" in value) ||
      !Array.isArray(value.steps)
    )
      return undefined;
    // Data comes from this origin's own versioned writer, never an uploaded file.
    return persisted(value as Workspace);
  } finally {
    db.close();
  }
}
export async function saveDraft(state: Workspace): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(persisted(state), "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
