'use strict';

const { EventEmitter } = require('events');
const os = require('os');
const Redis = require('ioredis');
const { createLogger } = require('../shared/logger');
const logger = createLogger('leader-election');

const LEADER_KEY = 'leader:coordinator';
const LEADER_TTL = 15;
const HEARTBEAT_INTERVAL = 5000;
const ELECTION_TIMEOUT = 3000;
const LEADER_CHECK_INTERVAL = 5000;

function deriveId(hostname) {
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) {
    hash = ((hash << 5) - hash + hostname.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

class LeaderElection extends EventEmitter {
  constructor({ redisUrl, coordinatorId } = {}) {
    super();
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this._id = coordinatorId != null
      ? Number(coordinatorId)
      : Number(process.env.COORDINATOR_ID) || deriveId(os.hostname());
    this._leader = null;
    this._isLeader = false;
    this._electionInProgress = false;
    this._heartbeatInterval = null;
    this._leaderCheckInterval = null;
    this._electionTimer = null;
    this._victoryTimer = null;
    this._redis = new Redis(url);
    this._sub = this._redis.duplicate();
    this._running = false;
  }

  get id() { return this._id; }

  isLeader() { return this._isLeader; }

  getLeaderId() { return this._leader; }

  async start() {
    this._running = true;
    await this._sub.subscribe('election:start', 'election:answer', 'election:victory');
    this._sub.on('message', (channel, message) => this._onMessage(channel, message));

    const existing = await this._redis.get(LEADER_KEY);
    if (!existing) {
      this._startElection();
    } else {
      this._leader = Number(existing);
      this._startLeaderCheck();
    }
  }

  async stop() {
    this._running = false;
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    if (this._leaderCheckInterval) clearInterval(this._leaderCheckInterval);
    if (this._electionTimer) clearTimeout(this._electionTimer);
    if (this._victoryTimer) clearTimeout(this._victoryTimer);
    this._heartbeatInterval = null;
    this._leaderCheckInterval = null;
    this._electionTimer = null;
    this._victoryTimer = null;
    try { await this._sub.unsubscribe(); } catch (_) {}
    try { await this._sub.quit(); } catch (_) {}
    try { await this._redis.quit(); } catch (_) {}
  }

  _onMessage(channel, message) {
    let data;
    try { data = JSON.parse(message); } catch (_) { return; }

    if (channel === 'election:start') {
      if (data.id < this._id) {
        this._redis.publish('election:answer', JSON.stringify({ id: this._id, to: data.id }));
        if (!this._electionInProgress) this._startElection();
      }
    } else if (channel === 'election:answer') {
      if (data.to === this._id && data.id > this._id) {
        this._electionAnswered = true;
      }
    } else if (channel === 'election:victory') {
      const newLeader = data.id;
      if (this._electionTimer) { clearTimeout(this._electionTimer); this._electionTimer = null; }
      if (this._victoryTimer) { clearTimeout(this._victoryTimer); this._victoryTimer = null; }
      this._electionInProgress = false;

      const wasLeader = this._isLeader;
      this._leader = newLeader;
      this._isLeader = (newLeader === this._id);

      if (wasLeader && !this._isLeader) {
        if (this._heartbeatInterval) { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }
        this.emit('demoted');
        this._startLeaderCheck();
      }
      if (this._isLeader && !wasLeader) {
        this._startHeartbeat();
        this.emit('elected');
      }
      this.emit('leader-changed', newLeader);
    }
  }

  _startElection() {
    if (this._electionInProgress) return;
    this._electionInProgress = true;
    this._electionAnswered = false;

    this._redis.publish('election:start', JSON.stringify({ id: this._id }));

    this._electionTimer = setTimeout(() => {
      this._electionTimer = null;
      if (!this._electionAnswered) {
        this._becomeLeader();
      } else {
        this._victoryTimer = setTimeout(() => {
          this._victoryTimer = null;
          this._electionInProgress = false;
          this._startElection();
        }, ELECTION_TIMEOUT);
      }
    }, ELECTION_TIMEOUT);
  }

  async _becomeLeader() {
    this._electionInProgress = false;
    this._isLeader = true;
    this._leader = this._id;
    await this._redis.set(LEADER_KEY, String(this._id), 'EX', LEADER_TTL);
    this._redis.publish('election:victory', JSON.stringify({ id: this._id }));
    this._startHeartbeat();
    this.emit('elected');
    this.emit('leader-changed', this._id);
  }

  _startHeartbeat() {
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    if (this._leaderCheckInterval) { clearInterval(this._leaderCheckInterval); this._leaderCheckInterval = null; }
    this._heartbeatInterval = setInterval(async () => {
      if (!this._isLeader) return;
      try {
        await this._redis.set(LEADER_KEY, String(this._id), 'EX', LEADER_TTL);
      } catch (err) {
        logger.error({ err: err.message }, 'Heartbeat failed');
      }
    }, HEARTBEAT_INTERVAL);
  }

  _startLeaderCheck() {
    if (this._leaderCheckInterval) clearInterval(this._leaderCheckInterval);
    this._leaderCheckInterval = setInterval(async () => {
      try {
        const current = await this._redis.get(LEADER_KEY);
        if (!current) {
          this._startElection();
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Leader check failed');
      }
    }, LEADER_CHECK_INTERVAL);
  }
}

module.exports = { LeaderElection, deriveId };
