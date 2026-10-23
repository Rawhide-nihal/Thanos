/**
 * Google Meet Integration Helper
 */

export interface MeetStatus {
  isMeetTabOpen: boolean;
  tabUrl: string | null;
  interceptorReady: boolean;
}

export class MeetIntegrationManager {
  private static instance: MeetIntegrationManager;

  private constructor() {}

  public static getInstance(): MeetIntegrationManager {
    if (!MeetIntegrationManager.instance) {
      MeetIntegrationManager.instance = new MeetIntegrationManager();
    }
    return MeetIntegrationManager.instance;
  }

  public async checkMeetStatus(): Promise<MeetStatus> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return { isMeetTabOpen: false, tabUrl: null, interceptorReady: false };
    }

    try {
      const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      if (tabs.length > 0 && tabs[0].id) {
        return {
          isMeetTabOpen: true,
          tabUrl: tabs[0].url || 'https://meet.google.com',
          interceptorReady: false,
        };
      }
    } catch {
      // Tab permissions or not in extension context
    }

    return { isMeetTabOpen: false, tabUrl: null, interceptorReady: false };
  }
}
