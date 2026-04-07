/**
 * Session Isolation for Universal Context MCP
 * 会话隔离（Task ID）
 */

/**
 * 会话隔离器
 */
class SessionIsolation {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * 创建新会话
   * @param {string} taskId - 任务 ID
   * @param {object} metadata - 会话元数据
   * @returns {string} - 会话 ID
   */
  createSession(taskId, metadata = {}) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.sessions.set(sessionId, {
      taskId,
      sessionId,
      createdAt: Date.now(),
      metadata,
      context: [],
      cache: new Map()
    });

    return sessionId;
  }

  /**
   * 获取会话
   * @param {string} sessionId - 会话 ID
   * @returns {object|null} - 会话对象
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取任务的所有会话
   * @param {string} taskId - 任务 ID
   * @returns {Array} - 会话列表
   */
  getTaskSessions(taskId) {
    const sessions = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.taskId === taskId) {
        sessions.push({ sessionId, ...session });
      }
    }
    return sessions;
  }

  /**
   * 更新会话上下文
   * @param {string} sessionId - 会话 ID
   * @param {object} context - 上下文
   */
  updateContext(sessionId, context) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.context.push({
      timestamp: Date.now(),
      ...context
    });
  }

  /**
   * 获取会话上下文
   * @param {string} sessionId - 会话 ID
   * @returns {Array} - 上下文列表
   */
  getContext(sessionId) {
    const session = this.getSession(sessionId);
    return session ? session.context : [];
  }

  /**
   * 缓存数据
   * @param {string} sessionId - 会话 ID
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  setCache(sessionId, key, value) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.cache.set(key, value);
  }

  /**
   * 获取缓存数据
   * @param {string} sessionId - 会话 ID
   * @param {string} key - 缓存键
   * @returns {any} - 缓存值
   */
  getCache(sessionId, key) {
    const session = this.getSession(sessionId);
    return session ? session.cache.get(key) : null;
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话 ID
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * 清理过期会话（24 小时）
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > 24 * 60 * 60 * 1000) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    return expiredSessions.length;
  }

  /**
   * 获取统计信息
   * @returns {object} - 统计信息
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.sessions.size, // 简化处理
      tasks: new Set([...this.sessions.values()].map(s => s.taskId)).size
    };
  }
}

export default SessionIsolation;
