# Doubao History Export Kit

这个目录保存豆包网页端历史聊天记录导出的可复用脚本、Skill 源文件和接口笔记。

## 目录

- `scripts/export-doubao-im.mjs`: 主导出脚本。
- `references/api-notes.md`: 关键接口、请求体、坑点记录。
- `skill/SKILL.md`: 可安装到 Codex 的 Skill 文档源文件。

## 使用

先在浏览器或 Cherry Studio 里登录豆包，把 `www.doubao.com` 的 cookie 复制到剪贴板，然后运行：

```bash
DOUBAO_OUT_DIR="./doubao-export" DOUBAO_COOKIE="$(pbpaste)" node doubao-history-export-kit/scripts/export-doubao-im.mjs
```

小样本测试：

```bash
DOUBAO_OUT_DIR="./doubao-export-test" \
DOUBAO_MAX_CONVERSATIONS=1 \
DOUBAO_MAX_MESSAGES_PER_CONVERSATION=100 \
DOUBAO_COOKIE="$(pbpaste)" \
node doubao-history-export-kit/scripts/export-doubao-im.mjs
```

## 输出

- `doubao-im-raw.json`: 原始 JSON 备份。
- `doubao-im-chats.md`: 完整 Markdown 聊天记录。
- `knowledge/doubao-self-chat-history.md`: dot-skill/self 蒸馏用清洁语料。
- `knowledge/doubao-self-user-only.md`: 仅用户自己的发言。

## 安全

不要把 cookie 写进文件或提交到仓库。导出完成后建议退出/重新登录豆包，让复制过的 cookie 失效。
