/**
 * PocketBaseClient — Thin wrapper for PocketBase REST API
 * Handles streamer and player authentication and cloud persistence
 */
export class PocketBaseClient {
  constructor(baseUrl = 'https://pb.timpim.dev') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    
    // Streamer Auth Settings
    this.token = localStorage.getItem('streamer_pb_token') || null;
    const savedRecord = localStorage.getItem('streamer_pb_record');
    this.record = savedRecord ? JSON.parse(savedRecord) : null;

    // Player Auth Settings
    this.playerToken = localStorage.getItem('player_pb_token') || null;
    const savedPlayerRecord = localStorage.getItem('player_pb_record');
    this.playerRecord = savedPlayerRecord ? JSON.parse(savedPlayerRecord) : null;
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  /* ------------------- STREAMER METHODS ------------------- */

  isAuthenticated() {
    return !!this.token;
  }

  async login(identity, password) {
    try {
      const response = await fetch(`${this.baseUrl}/api/collections/ag_streamers/auth-with-password`, {
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

  logout() {
    this.token = null;
    this.record = null;
    localStorage.removeItem('streamer_pb_token');
    localStorage.removeItem('streamer_pb_record');
  }

  async saveSettings(settings) {
    if (!this.isAuthenticated() || !this.record) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/collections/ag_streamers/records/${this.record.id}`, {
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

  async getStreamerBySlug(slug) {
    try {
      const cleanSlug = encodeURIComponent(slug.toLowerCase());
      const response = await fetch(
        `${this.baseUrl}/api/collections/ag_streamers/records?filter=(slug='${cleanSlug}'||twitch_name='${cleanSlug}')`
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

  /* ------------------- PLAYER METHODS ------------------- */

  isPlayerAuthenticated() {
    return !!this.playerToken;
  }

  async loginPlayer(identity, password) {
    try {
      const response = await fetch(`${this.baseUrl}/api/collections/ag_users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Authentication failed');
      }

      const data = await response.json();
      this.playerToken = data.token;
      this.playerRecord = data.record;

      localStorage.setItem('player_pb_token', this.playerToken);
      localStorage.setItem('player_pb_record', JSON.stringify(this.playerRecord));

      return { success: true, record: this.playerRecord };
    } catch (error) {
      console.error('[PocketBase] Player login error:', error);
      return { success: false, error: error.message };
    }
  }

  async registerPlayer(username, email, password, nickname) {
    try {
      const response = await fetch(`${this.baseUrl}/api/collections/ag_users/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email: email || undefined,
          password,
          passwordConfirm: password,
          nickname: nickname || username,
          high_score: 0,
          level: 1,
          wave: 1,
          chapter_unlocked: 1
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Registration failed');
      }

      // Auto login after registration
      return await this.loginPlayer(username, password);
    } catch (error) {
      console.error('[PocketBase] Player registration error:', error);
      return { success: false, error: error.message };
    }
  }

  async loginPlayerWithOAuth2(provider, code, codeVerifier, redirectUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/api/collections/ag_users/auth-with-oauth2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          code,
          codeVerifier,
          redirectUrl
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'OAuth authentication failed');
      }

      const data = await response.json();
      this.playerToken = data.token;
      this.playerRecord = data.record;

      localStorage.setItem('player_pb_token', this.playerToken);
      localStorage.setItem('player_pb_record', JSON.stringify(this.playerRecord));

      return { success: true, record: this.playerRecord };
    } catch (error) {
      console.error('[PocketBase] Player OAuth login error:', error);
      return { success: false, error: error.message };
    }
  }

  playerLogout() {
    this.playerToken = null;
    this.playerRecord = null;
    localStorage.removeItem('player_pb_token');
    localStorage.removeItem('player_pb_record');
  }

  async savePlayerData(saveData, stats = {}) {
    if (!this.isPlayerAuthenticated() || !this.playerRecord) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const body = {
        save_data: saveData
      };
      if (stats.high_score !== undefined) body.high_score = stats.high_score;
      if (stats.level !== undefined) body.level = stats.level;
      if (stats.wave !== undefined) body.wave = stats.wave;
      if (stats.chapter_unlocked !== undefined) body.chapter_unlocked = stats.chapter_unlocked;
      if (stats.nickname !== undefined) body.nickname = stats.nickname;

      const response = await fetch(`${this.baseUrl}/api/collections/ag_users/records/${this.playerRecord.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.playerToken}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to sync player data');
      }

      const updatedRecord = await response.json();
      this.playerRecord = updatedRecord;
      localStorage.setItem('player_pb_record', JSON.stringify(this.playerRecord));

      return { success: true, record: this.playerRecord };
    } catch (error) {
      console.error('[PocketBase] Sync player data error:', error);
      return { success: false, error: error.message };
    }
  }
}
