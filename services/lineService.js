// services/lineService.js
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN'
};

const client = new line.Client(config);

/**
 * 指定したLINE User IDにテキストメッセージをプッシュ送信する
 * @param {string} to - 送信先のLINE User ID
 * @param {string} messageText - 送信する本文
 */
async function sendPushMessage(to, messageText) {
  try {
    const message = {
      type: 'text',
      text: messageText,
    };
    const response = await client.pushMessage(to, message);
    console.log(`[LINE] 送信成功: ${to}`);
    return response;
  } catch (error) {
    console.error('[LINE] 送信エラー:', error);
    throw error;
  }
}

module.exports = { sendPushMessage };