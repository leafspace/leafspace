import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve(process.env.DOUBAO_OUT_DIR || 'doubao-export');
const cookie = process.env.DOUBAO_COOKIE;
const mainConversationId = process.env.DOUBAO_CONVERSATION_ID || '33405396060450306';
const maxConversations = Number(process.env.DOUBAO_MAX_CONVERSATIONS || 0);
const maxMessagesPerConversation = Number(process.env.DOUBAO_MAX_MESSAGES_PER_CONVERSATION || 0);
const listPageSize = Number(process.env.DOUBAO_LIST_PAGE_SIZE || 50);
const messagePageSize = Number(process.env.DOUBAO_MESSAGE_PAGE_SIZE || 50);
const requestTimeoutMs = Number(process.env.DOUBAO_REQUEST_TIMEOUT_MS || 20000);

if (!cookie) {
  throw new Error('DOUBAO_COOKIE is required. Example: DOUBAO_COOKIE="$(pbpaste)" node scripts/export-doubao-im.mjs');
}

function sequenceId() {
  return `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
}

function commonUrl(url) {
  const absolute = new URL(url, 'https://www.doubao.com');
  const defaults = {
    version_code: '20800',
    language: 'zh',
    device_platform: 'web',
    aid: '497858',
    real_aid: '497858',
    pkg_type: 'release_version',
    region: 'CN',
    sys_region: 'CN',
    samantha_web: '1',
    web_platform: 'browser',
    'use-olympus-account': '1',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!absolute.searchParams.has(key)) absolute.searchParams.set(key, value);
  }
  return absolute;
}

async function postJson(url, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(commonUrl(url), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'agw-js-conv': 'str',
        'content-type': 'application/json; encoding=utf-8',
        origin: 'https://www.doubao.com',
        referer: `https://www.doubao.com/chat/${mainConversationId}?channel=AIHub`,
        cookie,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(data),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function imBody(cmd, uplinkKey, uplinkBody) {
  return {
    cmd,
    uplink_body: { [uplinkKey]: uplinkBody },
    sequence_id: sequenceId(),
    channel: 2,
    version: '1',
  };
}

function unwrap(json, key) {
  if (!json) return undefined;
  const code = json.status_code ?? json.code ?? json.e;
  if (code !== undefined && Number(code) !== 0) {
    const msg = json.status_desc || json.msg || json.message || '';
    throw new Error(`Doubao API ${code}${msg ? `: ${msg}` : ''}`);
  }
  return json.downlink_body?.[key] ?? json.data?.[key] ?? json.data ?? json;
}

async function pullRecentConversations(cursor = '') {
  const convVersion = Number(cursor || 0);
  const json = await postJson(
    '/im/chain/recent_conv',
    imBody(3200, 'pull_recent_conv_chain_uplink_body', {
      api_version: 1,
      conv_version: convVersion,
      direction: convVersion === 0 ? 3 : 1,
      limit: listPageSize,
      message_count_per_conv: 10,
      option: {
        not_need_message: false,
        need_complete_conversation: true,
        need_coco_conversation: convVersion === 0,
        need_coco_bot: convVersion === 0,
        need_pc_pin_chain: true,
        pc_pin_query_type: 0,
      },
    }),
  );
  return unwrap(json, 'pull_recent_conv_chain_downlink_body') || {};
}

async function pullSingleChain(conversation, cursor, isReverse = true) {
  const json = await postJson(
    '/im/chain/single',
    imBody(3100, 'pull_singe_chain_uplink_body', {
      conversation_id: conversation.conversation_id || '',
      anchor_index: Number(cursor ?? 0),
      conversation_type: 3,
      direction: isReverse !== false ? 1 : 2,
      limit: messagePageSize,
      ext: {},
      filter: { index_list: [] },
      evaluate_ab_params: '',
      evaluate_common_params: '',
    }),
  );
  return unwrap(json, 'pull_singe_chain_downlink_body') || {};
}

function normalizeConversationCell(cell) {
  const conversation = cell?.conversation || cell;
  if (!conversation?.conversation_id) return null;
  return {
    cell_id: cell?.id || '',
    conversation_id: String(conversation.conversation_id),
    name: conversation.name || conversation.title || 'Untitled',
    bot_id: conversation.bot_id || '',
    latest_index: Number(conversation.latest_index || conversation.message_index || conversation.badge_count || 0),
    update_time: Number(conversation.update_time || 0),
    raw: conversation,
  };
}

function contentText(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const parsedText = contentText(JSON.parse(trimmed));
      if (parsedText) return parsedText;
    } catch {}
    return trimmed;
  }
  if (typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text.trim();
  if (typeof value.markdown === 'string') return value.markdown.trim();
  if (typeof value.display_content === 'string') return value.display_content.trim();
  if (typeof value.tts_content === 'string') return value.tts_content.trim();
  if (typeof value.text_block?.text === 'string') return value.text_block.text.trim();
  if (typeof value.content?.text_block?.text === 'string') return value.content.text_block.text.trim();
  if (typeof value.content_v2?.text_block?.text === 'string') return value.content_v2.text_block.text.trim();
  if (typeof value.artifact_block?.brief === 'string') return value.artifact_block.brief.trim();
  for (const key of ['content', 'content_v2', 'content_obj', 'body']) {
    const text = contentText(value[key]);
    if (text) return text;
  }
  for (const key of ['content_block', 'content_blocks', 'content_blocks_v2', 'blocks', 'children']) {
    if (Array.isArray(value[key])) {
      const text = value[key].map(contentText).filter(Boolean).join('\n\n');
      if (text) return text;
    }
  }
  return '';
}

function collectMessages(value) {
  const messages = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) {
      const id = node.message_id || node.messageId || node.local_message_id;
      const index = node.index_in_conv ?? node.index ?? node.message_index ?? node.messageIndex;
      const conversationId = node.conversation_id || node.conversationId;
      const text = contentText(node);
      if (id && Number(index || 0) > 0 && text) {
        messages.push({
          conversation_id: conversationId ? String(conversationId) : '',
          message_id: String(id),
          index: Number(index || 0),
          user_type: Number(node.user_type || node.sender_type || 0),
          create_time: Number(node.create_time || node.created_at || 0),
          reply_id: node.reply_id || '',
          text,
          raw: node,
        });
      }
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(value);
  const dedup = new Map();
  for (const message of messages) {
    const existing = dedup.get(message.message_id);
    if (!existing || existing.text.length < message.text.length) dedup.set(message.message_id, message);
  }
  return [...dedup.values()].sort((a, b) => a.index - b.index || a.message_id.localeCompare(b.message_id));
}

function role(message) {
  if (message.user_type === 1) return '用户';
  if (message.user_type === 2 || message.user_type === 4) return '豆包';
  return message.user_type ? `类型 ${message.user_type}` : '消息';
}

function selfRole(message) {
  return message.user_type === 1 ? '我' : role(message);
}

function fmtTime(ts) {
  if (!ts) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toISOString();
}

function mdEscapeTitle(value) {
  return String(value || 'Untitled').replace(/\s+/g, ' ').trim();
}

function messageHeading(message, label = role(message)) {
  return `### ${label} #${message.index || ''}${message.create_time ? ` (${fmtTime(message.create_time)})` : ''}`;
}

async function loadAllConversations() {
  const conversations = [];
  const seen = new Set();
  let cursor = '';
  for (let page = 1; page <= 200; page++) {
    const data = await pullRecentConversations(cursor);
    const cells = Array.isArray(data.cells) ? data.cells : [];
    for (const cell of cells) {
      const conversation = normalizeConversationCell(cell);
      if (conversation && !seen.has(conversation.conversation_id)) {
        seen.add(conversation.conversation_id);
        conversations.push(conversation);
      }
    }
    console.log(`conversation page ${page}: +${cells.length}, total=${conversations.length}`);
    if (!data.has_more || !data.next_conv_version) break;
    cursor = String(data.next_conv_version);
    if (maxConversations && conversations.length >= maxConversations) break;
  }
  return maxConversations ? conversations.slice(0, maxConversations) : conversations;
}

async function loadConversationMessages(conversation) {
  const pages = [];
  const allMessages = new Map();
  let cursor = conversation.latest_index || Number.MAX_SAFE_INTEGER;
  for (let page = 1; page <= 300; page++) {
    const data = await pullSingleChain(conversation, cursor, true);
    pages.push(data);
    const messages = collectMessages(data).filter((m) => !m.conversation_id || m.conversation_id === conversation.conversation_id);
    for (const message of messages) {
      const existing = allMessages.get(message.message_id);
      if (!existing || existing.text.length < message.text.length) allMessages.set(message.message_id, message);
    }
    const sorted = [...allMessages.values()].sort((a, b) => a.index - b.index);
    const minIndex = sorted[0]?.index || 0;
    const nextIndex = Number(data.next_index || 0);
    console.log(`  ${conversation.conversation_id} page ${page}: +${messages.length}, total=${allMessages.size}, min=${minIndex}, next=${nextIndex}`);
    if (maxMessagesPerConversation && allMessages.size >= maxMessagesPerConversation) break;
    if (!messages.length || minIndex <= 1 || data.has_more === false) break;
    const nextCursor = nextIndex || minIndex - 1;
    if (nextCursor <= 0 || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  const messages = [...allMessages.values()].sort((a, b) => a.index - b.index || a.message_id.localeCompare(b.message_id));
  return {
    ...conversation,
    messages: maxMessagesPerConversation ? messages.slice(-maxMessagesPerConversation) : messages,
    raw_pages: pages,
  };
}

function fullMarkdown(exported, exportedAt) {
  return [
    '# 豆包历史聊天记录导出',
    '',
    `导出时间：${exportedAt}`,
    `会话数：${exported.length}`,
    `消息数：${exported.reduce((sum, conversation) => sum + conversation.messages.length, 0)}`,
    '',
    ...exported.flatMap((conversation, index) => [
      `## ${index + 1}. ${mdEscapeTitle(conversation.name)}`,
      '',
      `Conversation ID: \`${conversation.conversation_id}\``,
      `Latest Index: \`${conversation.latest_index || ''}\``,
      '',
      ...conversation.messages.flatMap((message) => [
        messageHeading(message),
        '',
        message.text,
        '',
      ]),
    ]),
  ].join('\n');
}

function knowledgeMarkdown(conversation, exportedAt) {
  const first = conversation.messages[0];
  const last = conversation.messages.at(-1);
  return [
    '# 豆包聊天历史语料（用于 self dot-skill 蒸馏）',
    '',
    `来源会话：${conversation.name}`,
    `Conversation ID：${conversation.conversation_id}`,
    `导出时间：${exportedAt}`,
    `消息数：${conversation.messages.length}`,
    `索引范围：${first?.index || ''} - ${last?.index || ''}`,
    '',
    '## 对话正文',
    '',
    ...conversation.messages.flatMap((message) => [
      messageHeading(message, selfRole(message)),
      '',
      message.text,
      '',
    ]),
  ].join('\n');
}

function userOnlyMarkdown(conversation) {
  const userMessages = conversation.messages.filter((message) => message.user_type === 1);
  return [
    '# 豆包聊天历史语料：仅我的发言',
    '',
    `来源会话：${conversation.name}`,
    `Conversation ID：${conversation.conversation_id}`,
    `用户消息数：${userMessages.length}`,
    '',
    '## 我的发言',
    '',
    ...userMessages.flatMap((message) => [
      messageHeading(message, '我'),
      '',
      message.text,
      '',
    ]),
  ].join('\n');
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const conversations = await loadAllConversations();
  const exported = [];
  for (let index = 0; index < conversations.length; index++) {
    const conversation = conversations[index];
    console.log(`messages ${index + 1}/${conversations.length}: ${conversation.name} (${conversation.conversation_id})`);
    exported.push(await loadConversationMessages(conversation));
  }

  const exportedAt = new Date().toISOString();
  const rawPath = path.join(outDir, 'doubao-im-raw.json');
  const mdPath = path.join(outDir, 'doubao-im-chats.md');
  const knowledgeDir = path.join(outDir, 'knowledge');
  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.writeFile(rawPath, JSON.stringify({ exported_at: exportedAt, conversations: exported }, null, 2));
  await fs.writeFile(mdPath, fullMarkdown(exported, exportedAt));

  for (const conversation of exported) {
    const suffix = exported.length === 1 ? '' : `-${conversation.conversation_id}`;
    await fs.writeFile(path.join(knowledgeDir, `doubao-self-chat-history${suffix}.md`), knowledgeMarkdown(conversation, exportedAt));
    await fs.writeFile(path.join(knowledgeDir, `doubao-self-user-only${suffix}.md`), userOnlyMarkdown(conversation));
  }

  console.log(`wrote ${rawPath}`);
  console.log(`wrote ${mdPath}`);
  console.log(`wrote ${knowledgeDir}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
