/**
 * PocketBaseClient — Thin wrapper for PocketBase REST API
 * Handles streamer authentication and settings persistence
 */
export class PocketBaseClient {
  constructor(baseUrl = 'https://pb.timpim.dev') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = localStorage.getItem('streamer_pb_token') || null;
    
    const savedRecord = localStorage.getItem('streamer_pb_record');
    this.record = savedRecord ? JSON.parse(savedRecord) : null;
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Authenticate as a streamer
   */
  async login(identity, password) {
    try {
      const response = await fetch(`${this.baseUrl}/api/collections/dr_streamers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Authentication failed');
      }

      const data = await response.json();
      this.token = data.token;
      this.record = data.record;

      localStorage.setItem('streamer_pb_token', this.token);
      localStorage.setItem('streamer_pb_record', JSON.stringify(this.record));

      return { success: true, record: this.record };
    } catch (error) {
      console.error('[PocketBase] Login error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log out streamer
   */
  logout() {
    this.token = null;
    this.record = null;
    localStorage.removeItem('streamer_pb_token');
    localStorage.removeItem('streamer_pb_record');
  }

  /**
   * Persist streamer settings to PocketBase
   */
  async saveSettings(settings) {
    if (!this.isAuthenticated() || !this.record) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/collections/dr_streamers/records/${this.record.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ settings })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to save settings');
      }

      const updatedRecord = await response.json();
      this.record = updatedRecord;
      localStorage.setItem('streamer_pb_record', JSON.stringify(this.record));

      return { success: true, record: this.record };
    } catch (error) {
      console.error('[PocketBase] Save settings error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch streamer settings by slug or twitch name (public)
   */
  async getStreamerBySlug(slug) {
    try {
      const cleanSlug = encodeURIComponent(slug.toLowerCase());
      // Filter by slug OR twitch_name to support both slug access and Twitch ID channel joins
      const response = await fetch(
        `${this.baseUrl}/api/collections/dr_streamers/records?filter=(slug='${cleanSlug}'||twitch_name='${cleanSlug}')`
      );

      if (!response.ok) {
        throw new Error('Streamer not found');
      }

      const data = await response.json();
      if (data.items && data.items.length > 0) {
        return { success: true, record: data.items[0] };
      }
      return { success: false, error: 'No streamer found with that slug or Twitch name' };
    } catch (error) {
      console.error('[PocketBase] Get streamer error:', error);
      return { success: false, error: error.message };
    }
  }
}
