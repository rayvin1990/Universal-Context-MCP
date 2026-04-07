# 推送分类管理制度

**建立时间**：2026-04-07
**负责人**：mia

---

## 目录分类

### 🔴 私有目录（不推送）
- `TOOLS.md` - 本地工具配置（含 API Key）
- `.env.local` - 本地环境变量
- `credentials/` - 凭证目录
- `memory/` - 个人记忆（含敏感信息）
- `company/` - 公司内部资料
- `archive/` - 归档项目（可能含旧密钥）

### 🟡 脱敏后可推送
- `projects/*/README.md` - 需确认无密钥
- `SECURITY_CHECKLIST.md` - 敏感信息已用 REDACTED
- `memory/` - 仅无密钥的公开笔记

### 🟢 公开可推送
- `AGENTS.md`, `SOUL.md`, `USER.md` - 角色定义（无密钥）
- `HEARTBEAT.md` - 定时任务配置
- `PUSH_POLICY.md` - 本制度
- `projects/*/src/` - 源代码
- `utils/*.js` - 工具脚本（需无密钥）

---

## 推送前检查清单

1. ✅ 确认文件在公开目录或已脱敏
2. ✅ 确认无 `cli_`, `sk-`, `AKIA`, `REDACTED` 以外的密钥
3. ✅ pre-hook 扫描通过

---

## mia 职责

1. **分类审核**：每次推送前检查文件是否在正确目录
2. **脱敏处理**：发现密钥立即替换为 REDACTED
3. **目录维护**：更新本制度反映新目录

---

**最后更新**：2026-04-07