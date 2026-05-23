import express from "express";
import axios from "axios";
import { MongoClient, ObjectId } from "mongodb";

const app = express();

app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const MONGO = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 10000;

const START_IMAGE = "AgACAgUAAxkBAAIBgmoQIZ8IpYDivrIbUrsvAAEZznqwKgACqxBrG470gFSDEcSLOUZEVAEAAwIAA3cAAzsE";

const client = new MongoClient(MONGO);

const uploadMode = {};

const uploadType = {};



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
      const command = text.toLowerCase();



      if (uploadMode[chatId] && String(chatId) === String(ADMIN_ID)) {

        let file = null;

        const type = uploadType[chatId];

        if (type === "document" && msg.document) {

          file = {
            file_id: msg.document.file_id,
            file_name:
              msg.document.file_name || "Unnamed File"
          };
        }

        else if (type === "music" && msg.audio) {

          file = {
            file_id: msg.audio.file_id,
            file_name:
              msg.audio.file_name ||
              msg.audio.title ||
              "Unnamed Music"
          };
        }

        else if (type === "video" && msg.video) {

          file = {
            file_id: msg.video.file_id,
            file_name:
              msg.video.file_name || "Unnamed Video"
          };
        }

        else if (type === "picture" && msg.photo) {

          const photo =
            msg.photo[msg.photo.length - 1];

          file = {
            file_id: photo.file_id,
            file_name: "Photo"
          };
        }

        else if (type === "gif" && msg.animation) {

          file = {
            file_id: msg.animation.file_id,
            file_name:
              msg.animation.file_name || "GIF"
          };
        }

        else if (type === "sticker" && msg.sticker) {

          file = {
            file_id: msg.sticker.file_id,
            file_name: "Sticker"
          };
        }

        else if (type === "audio" && msg.voice) {

          file = {
            file_id: msg.voice.file_id,
            file_name: "Voice Message"
          };
        }

        else if (type === "other") {

          if (msg.document) {

            file = {
              file_id: msg.document.file_id,
              file_name:
                msg.document.file_name || "Other File"
            };
          }
        }

        if (file) {

          await db.files.insertOne({
            file_id: file.file_id,
            file_name: file.file_name,
            uploaded_at: new Date()
          });

          await sendMessage(
            chatId,
            `✅ Saved: ${file.file_name}`
          );
        }
      }

      if (command.startsWith("/start")) {

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


      if (command.startsWith("/search")) {

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
        }).limit(8).toArray();

        if (!results.length) {
          await sendMessage(chatId, "❌ No files found.");
          return res.sendStatus(200);
        }

        const buttons = results.map((file) => {
          return [{
            text: file.file_name.slice(0, 40),
            callback_data: `getfile_${file._id}`
          }];
        });

        const totalResults = await db.files.countDocuments({
          file_name: {
            $regex: keyword,
            $options: "i"
          }
        });

        const totalPages = Math.ceil(totalResults / 8);

        buttons.push([
          {
            text: "❮",
            callback_data: "noop"
          },
          {
            text: `1/${totalPages}`,
            callback_data: "noop"
          },
          {
            text: "❯",
            callback_data:
              totalPages > 1
                ? `next_${keyword}_2`
                : "noop"
          }
        ]);

        buttons.push([
          {
            text: "🔒 Close",
            callback_data: "close_search"
          }
        ]);

        await sendMessage(
          chatId,
          `🔎 ${keyword}`,
          {
            inline_keyboard: buttons
          }
        );
      }

      
      if (command.startsWith("/upload")) {

        if (String(chatId) !== String(ADMIN_ID)) {
          return res.sendStatus(200);
        }

        uploadMode[chatId] = true;

        await sendMessage(
          chatId,
          "Upload mode enabled."
        );
      }

      if (command.startsWith("/stopupload")) {

        if (String(chatId) !== String(ADMIN_ID)) {
          return res.sendStatus(200);
        }

        uploadMode[chatId] = false;

        await sendMessage(
          chatId,
          "Upload mode disabled."
        );
      }


      if (command.startsWith("/admin")) {

        if (String(chatId) !== String(ADMIN_ID)) {
          return res.sendStatus(200);
        }

        await sendMessage(
          chatId,
          "Admin Panel",
          {
            inline_keyboard: [
              [
                {
                  text: " Upload ",
                  callback_data: "admin_upload"
                }
              ],
              [
                {
                  text: "⬅ Back",
                  callback_data: "admin_back"
                },
                {
                  text: "🔒 Close",
                  callback_data: "close_search"
                }
              ]
            ]
          }
        );
      }

if (command.startsWith("/list")) {

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

      if (query.data === "close_search") {

        uploadMode[query.message.chat.id] = false;
        uploadType[query.message.chat.id] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );

        return res.sendStatus(200);
      }

      
      if (query.data === "admin_upload") {

        uploadMode[query.message.chat.id] = false;
        uploadType[query.message.chat.id] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Upload",
            reply_markup: {
              inline_keyboard: [

                [
                  {
                    text: " Picture ",
                    callback_data: "upload_picture"
                  },
                  {
                    text: " Video ",
                    callback_data: "upload_video"
                  }
                ],

                [
                  {
                    text: " File / Document ",
                    callback_data: "upload_document"
                  },
                  {
                    text: " Audio ",
                    callback_data: "upload_audio"
                  }
                ],

                [
                  {
                    text: " GIF ",
                    callback_data: "upload_gif"
                  },
                  {
                    text: " Sticker ",
                    callback_data: "upload_sticker"
                  }
                ],

                [
                  {
                    text: " Music ",
                    callback_data: "upload_music"
                  },
                  {
                    text: " Other ",
                    callback_data: "upload_other"
                  }
                ],

                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: "🔒 Close",
                    callback_data: "close_search"
                  }
                ]

              ]
            }
          }
        );

        return res.sendStatus(200);
      }



      
      const uploadButtons = [
        "upload_picture",
        "upload_video",
        "upload_document",
        "upload_audio",
        "upload_gif",
        "upload_sticker",
        "upload_music",
        "upload_other"
      ];

      if (uploadButtons.includes(query.data)) {

        const type = query.data.replace("upload_", "");

        uploadMode[query.message.chat.id] = true;
        uploadType[query.message.chat.id] = type;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: `${type.toUpperCase()} Upload Mode Active`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🛑 Stop Upload",
                    callback_data: "stop_upload_button"
                  }
                ],
                [
                  {
                    text: "⬅ Back",
                    callback_data: "admin_upload"
                  },
                  {
                    text: "🔒 Close",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }

      if (query.data === "stop_upload_button") {

        uploadMode[query.message.chat.id] = false;
        uploadType[query.message.chat.id] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Upload Stopped",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data: "admin_upload"
                  },
                  {
                    text: "🔒 Close",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


if (query.data === "admin_back") {

        return res.sendStatus(200);
      }

      
      if (query.data === "back_admin_panel") {

        uploadMode[query.message.chat.id] = false;
        uploadType[query.message.chat.id] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Admin Panel",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: " Upload ",
                    callback_data: "admin_upload"
                  }
                ],
                [
                  {
                    text: "⬅ Back",
                    callback_data: "admin_back"
                  },
                  {
                    text: "🔒 Close",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



      if (query.data === "close_start") {

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );

        return res.sendStatus(200);
      }


      if (query.data.startsWith("next_")) {

        const parts = query.data.split("_");

        const keyword = parts[1];
        const page = Number(parts[2]);

        const skip = (page - 1) * 8;

        const results = await db.files.find({
          file_name: {
            $regex: keyword,
            $options: "i"
          }
        }).skip(skip).limit(8).toArray();

        const totalResults = await db.files.countDocuments({
          file_name: {
            $regex: keyword,
            $options: "i"
          }
        });

        const totalPages = Math.ceil(totalResults / 8);

        const buttons = results.map((file) => {
          return [{
            text: file.file_name.slice(0, 40),
            callback_data: `getfile_${file._id}`
          }];
        });

        const nav = [];

        nav.push({
          text: page > 1 ? "❮" : "•",
          callback_data: page > 1
            ? `next_${keyword}_${page - 1}`
            : "page_info"
        });

        nav.push({
          text: `${page}/${totalPages}`,
          callback_data: "page_info"
        });

        nav.push({
          text: page < totalPages ? "❯" : "•",
          callback_data: page < totalPages
            ? `next_${keyword}_${page + 1}`
            : "page_info"
        });

        buttons.push(nav);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: `🔎 ${keyword}`,
            reply_markup: {
              inline_keyboard: [
                ...buttons,
                [
                  {
                    text: "🔒 Close",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );
      }


      if (query.data.startsWith("getfile_")) {

        const fileDbId = query.data.replace("getfile_", "");

        const file = await db.files.findOne({
          _id: new ObjectId(fileDbId)
        });

        if (!file) {
          return res.sendStatus(200);
        }

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/sendDocument`,
          {
            chat_id: query.message.chat.id,
            document: file.file_id,
            caption: file.file_name
          }
        );

        return res.sendStatus(200);
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
