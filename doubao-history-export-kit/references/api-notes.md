# 豆包历史记录导出关键技术点

## 真实可用接口

豆包网页端当前历史记录走 IM 网关，不是 `https://mcs.doubao.com/list`。`mcs.doubao.com/list` 是埋点/遥测接口，返回类似 `{"e":0,"sc":10,"tc":10}`，没有聊天正文。

会话列表：

- `POST https://www.doubao.com/im/chain/recent_conv`
- `cmd`: `3200`
- uplink key: `pull_recent_conv_chain_uplink_body`
- downlink key: `pull_recent_conv_chain_downlink_body`

单会话消息分页：

- `POST https://www.doubao.com/im/chain/single`
- `cmd`: `3100`
- uplink key: `pull_singe_chain_uplink_body`
- downlink key: `pull_singe_chain_downlink_body`
- 注意：字段名是豆包前端里的拼写 `singe`，不是 `single`。

## IM 网关外层协议

请求体外层：

```json
{
  "cmd": 3100,
  "uplink_body": {
    "pull_singe_chain_uplink_body": {}
  },
  "sequence_id": "timestamp-random",
  "channel": 2,
  "version": "1"
}
```

响应正文通常在：

```text
downlink_body.<downlinkKey>
```

错误码字段通常是 `status_code`，成功为 `0`。

## 重要 Headers

必须带登录态 cookie。脚本从环境变量 `DOUBAO_COOKIE` 读取，不要把 cookie 写进文件。

关键 header：

- `cookie: <DOUBAO_COOKIE>`
- `content-type: application/json; encoding=utf-8`
- `agw-js-conv: str`
- `origin: https://www.doubao.com`
- `referer: https://www.doubao.com/chat/<conversation_id>?channel=AIHub`

如果 `content-type` 写成普通 `application/json`，可能报 `712012002: 不支持编码类型`。

## 会话列表分页

首包：

```json
{
  "api_version": 1,
  "conv_version": 0,
  "direction": 3,
  "limit": 50,
  "message_count_per_conv": 10,
  "option": {
    "not_need_message": false,
    "need_complete_conversation": true,
    "need_coco_conversation": true,
    "need_coco_bot": true,
    "need_pc_pin_chain": true,
    "pc_pin_query_type": 0
  }
}
```

后续包：

- `conv_version` 使用上次响应 `next_conv_version`
- `direction` 改为 `1`
- 直到 `has_more` 为 false 或没有 `next_conv_version`

## 单会话消息分页

请求体核心：

```json
{
  "conversation_id": "33405396060450306",
  "anchor_index": 3301,
  "conversation_type": 3,
  "direction": 1,
  "limit": 50,
  "ext": {},
  "filter": {
    "index_list": []
  },
  "evaluate_ab_params": "",
  "evaluate_common_params": ""
}
```

关键细节：

- `direction: 1` 表示向旧消息分页。
- `anchor_index` 首次可用会话的 `latest_index/message_index/badge_count`。
- 后续优先使用响应 `next_index` 作为下一次 `anchor_index`。
- 不要主动传 `filter.bot_id`。这次实测会导致 `/im/chain/single` 报 `712010702: 系统内部异常`。
- 消息真实序号优先读 `index_in_conv`，不是 `index`。

## 文本提取

正文可能在：

- `tts_content`
- `display_content`
- `content`
- `content_block[].content.text_block.text`
- `content_v2.text_block.text`
- JSON 字符串内嵌的 block 数组

保守策略：保留原始 JSON，同时生成 Markdown。如果后续字段变化，可以从 `doubao-im-raw.json` 重新抽取。

## 安全注意

- 只从剪贴板或环境变量临时读取 cookie。
- 不打印 cookie。
- 不把 cookie 写进脚本、日志或 Markdown。
- 导出完成后建议用户退出/重新登录豆包，让旧 cookie 失效。
