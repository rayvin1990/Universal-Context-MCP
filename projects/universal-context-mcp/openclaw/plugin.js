/**
 * OpenClaw Universal Context MCP Plugin
 * MCP Server 作为 OpenClaw 插件
 */

import { UniversalContextMCPServer } from './src/server.js';

/**
 * OpenClaw 插件入口
 */
class UniversalContextMCPPlugin {
  constructor() {
    this.server = new UniversalContextMCPServer();
    this.enabled = false;
  }

  async initialize() {
    if (this.enabled) {
      return;
    }

    await this.server.start();
    this.enabled = true;
    console.log('Universal Context MCP Plugin initialized');
  }

  async shutdown() {
    if (!this.enabled) {
      return;
    }

    await this.server.stop();
    this.enabled = false;
    console.log('Universal Context MCP Plugin shutdown');
  }

  async handleRequest(request) {
    if (!this.enabled) {
      throw new Error('Plugin not initialized');
    }

    return await this.server.handle(request);
  }
}

export default UniversalContextMCPPlugin;
