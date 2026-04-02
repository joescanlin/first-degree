import { createBlankProfile, parseProfile, type FamilyHistoryProfile } from './profile';

const STORAGE_KEY = 'first-degree:draft-profile:v1';

export function loadProfile(): FamilyHistoryProfile {
  if (typeof window === 'undefined') {
    return createBlankProfile();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createBlankProfile();
    }

    const parsed = parseProfile(JSON.parse(raw));
    return parsed ?? createBlankProfile();
  } catch {
    return createBlankProfile();
  }
}

export function saveProfile(profile: FamilyHistoryProfile): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearSavedProfile(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
