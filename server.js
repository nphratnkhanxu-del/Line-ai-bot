require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------- ตั้งค่า LINE ----------
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});
const lineMiddleware = line.middleware(lineConfig);

// ---------- ตั้งค่า Gemini AI (ฟรี) ----------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash', // อยู่ในฟรีเทียร์ของ Google
  systemInstruction:
    'คุณเป็นผู้ช่วย AI ที่ตอบคำถามผ่านแชท LINE ตอบให้กระชับ เป็นกันเอง เข้าใจง่าย และตอบเป็นภาษาไทยเป็นหลัก เว้นแต่ผู้ใช้ถามเป็นภาษาอื่น',
});

// เก็บประวัติแชทของแต่ละคนไว้ในหน่วยความจำ (ง่าย ๆ ไม่ต้องใช้ฐานข้อมูล)
// หมายเหตุ: ถ้าเซิร์ฟเวอร์รีสตาร์ท ประวัติจะหายไป (เหมาะกับ demo/เริ่มต้น)
const chatHistory = new Map(); // key: userId, value: array of {role, parts}
const MAX_HISTORY_MESSAGES = 10; // เก็บย้อนหลังกี่ข้อความ กันบริบทยาวเกินไป

async function askGemini(userId, userMessage) {
  const history = chatHistory.get(userId) || [];

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  const replyText = result.response.text();

  const updatedHistory = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ text: replyText }] },
  ];
  // ตัดประวัติให้ไม่ยาวเกินไป
  chatHistory.set(userId, updatedHistory.slice(-MAX_HISTORY_MESSAGES));

  return replyText || 'ขอโทษครับ ตอบไม่ได้ในตอนนี้ ลองถามใหม่อีกครั้งนะครับ';
}

async function handleEvent(event) {
  // รับเฉพาะข้อความตัวอักษรที่ผู้ใช้พิมพ์มา
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId || 'unknown';
  const userMessage = event.message.text;

  let replyText;
  try {
    replyText = await askGemini(userId, userMessage);
  } catch (err) {
    console.error('AI error:', err);
    replyText = 'ขอโทษครับ ระบบ AI มีปัญหาชั่วคราว ลองใหม่อีกครั้งนะครับ';
  }

  return lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }],
  });
}

const app = express();

app.get('/', (req, res) => {
  res.send('LINE AI bot is running.');
});

app.post('/webhook', lineMiddleware, async (req, res) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
