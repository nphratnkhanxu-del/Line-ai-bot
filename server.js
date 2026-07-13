require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==========================
// LINE CONFIG
// ==========================
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const middleware = line.middleware(lineConfig);

// ==========================
// GEMINI CONFIG
// ==========================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction:
    "คุณเป็นผู้ช่วย AI ภาษาไทย ตอบสั้น กระชับ สุภาพ เข้าใจง่าย ถ้าผู้ใช้ถามภาษาอื่นให้ตอบภาษานั้น",
});

// ==========================
// CHAT MEMORY
// ==========================
const chatHistory = new Map();

const MAX_HISTORY_MESSAGES = 4;
const MAX_INPUT_LENGTH = 1000;

// ==========================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================

async function askGemini(userId, message) {

  const history = chatHistory.get(userId) || [];

  const chat = model.startChat({
    history
  });

  let result;

  try {

    result = await chat.sendMessage(message);

  } catch (err) {

    // Retry เมื่อเจอ 429
    if (err.status === 429) {

      console.log("Quota exceeded, retry after 35 sec...");

      await sleep(35000);

      result = await chat.sendMessage(message);

    } else {

      throw err;

    }

  }

  const text = result.response.text();

  const updatedHistory = await chat.getHistory();

  chatHistory.set(
    userId,
    updatedHistory.slice(-MAX_HISTORY_MESSAGES)
  );

  return text || "ขออภัย ไม่สามารถตอบได้";
}

// ==========================

async function handleEvent(event) {

  if (
    event.type !== "message" ||
    event.message.type !== "text"
  ) {
    return null;
  }

  const userId = event.source.userId || "unknown";

  const userMessage =
    event.message.text.substring(0, MAX_INPUT_LENGTH);

  let replyText;

  try {

    replyText = await askGemini(userId, userMessage);

  } catch (err) {

    console.error(err);

    if (err.status === 429) {

      replyText =
        "ตอนนี้ AI มีผู้ใช้งานจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง 🙏";

    } else {

      replyText =
        "ขออภัย ระบบ AI ขัดข้องชั่วคราว";

    }

  }

  return client.replyMessage({

    replyToken: event.replyToken,

    messages: [
      {
        type: "text",
        text: replyText
      }
    ]

  });

}

// ==========================

const app = express();

app.get("/", (req, res) => {

  res.send("LINE AI BOT RUNNING");

});

app.post(
  "/webhook",
  middleware,
  async (req, res) => {

    try {

      await Promise.all(
        req.body.events.map(handleEvent)
      );

      res.status(200).end();

    } catch (err) {

      console.error(err);

      res.status(500).end();

    }

  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log("Server Started :", PORT);

});
