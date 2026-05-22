import express from "express";
import axios from "axios";
import { MongoClient } from "mongodb";

const app = express();

app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const MONGO = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 10000;

const START_IMAGE = "AgACAgUAAxkBAAIBgmoQIZ8IpYDivrIbUrsvAAEZznqwKgACqxBrG470gFSDEcSLOUZEVAEAAwIAA3cAAzsE";

const client = new MongoClient(MONGO);

async function getDB() {
  await client.connect();

  return {
    files: client.db("telegramBot").collection("files"),
    notes: client.db("telegramBot").collection("notes"),
    users: client.db("telegramBot").collection("users")
  };
}

async function sendMessage(chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    payload
  );
}

async function sendPhoto(chatId, photo, caption, keyboard = null) {
  const payload = {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML"
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendPhoto`,
    payload
  );
}

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const db = await getDB();

    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat.id;
      const text = msg.text || "";


      if (msg.document && String(chatId) === String(ADMIN_ID)) {

        const doc = msg.document;

        await db.files.insertOne({
          file_id: doc.file_id,
          file_name: doc.file_name || "Unnamed File",
          uploaded_at: new Date()
        });

        await sendMessage(
          chatId,
          `✅ Saved: ${doc.file_name}`
        );
      }

      if (text.startsWith("/start")) {

        const user_name = msg.from.first_name || "User";

        const caption =
`<b>Konnichiwa, ${user_name}</b> 👋

I'm TpX Bot.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "🔒 Close",
                callback_data: "close_start"
              }
            ]
          ]
        };

        await sendPhoto(chatId, START_IMAGE, caption, keyboard);
      }


      if (text.startsWith("/search")) {

        const keyword = text.split(" ").slice(1).join(" ").trim();

        if (!keyword) {
          await sendMessage(chatId, "Usage: /search keyword");
          return res.sendStatus(200);
        }

        const results = await db.files.find({
          file_name: {
            $regex: keyword,
            $options: "i"
          }
        }).limit(10).toArray();

        if (!results.length) {
          await sendMessage(chatId, "❌ No files found.");
          return res.sendStatus(200);
        }

        const buttons = results.map((file) => {
          return [{
            text: file.file_name.slice(0, 40),
            callback_data: `getfile_${file.file_id}`
          }];
        });

        await sendMessage(
          chatId,
          `🔎 Results for: ${keyword}`,
          {
            inline_keyboard: buttons
          }
        );
      }

      if (text.startsWith("/list")) {

        const files = await db.files.find({}).toArray();

        if (!files.length) {
          await sendMessage(chatId, "No files uploaded.");
        } else {
          await sendMessage(
            chatId,
            `📁 Total Files: ${files.length}`
          );
        }
      }
    }

    if (body.callback_query) {

      const query = body.callback_query;

      if (query.data === "close_start") {

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err.response?.data || err.message || err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
