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

const broadcastMode = {};

const banMode = {};

const pendingBanId = {};

const historySearchMode = {};

const adminState = {};

const nodeActionState = {};

const nodeFilesState = {};

const nodePosterState = {};

function clearAdminStates(chatId) {

  nodeActionState[chatId] = null;
  nodeFilesState[chatId] = null;
  nodePosterState[chatId] = null;

  uploadMode[chatId] = false;
  uploadType[chatId] = null;

  broadcastMode[chatId] = false;

  banMode[chatId] = false;
  pendingBanId[chatId] = null;

  historySearchMode[chatId] = false;

  delete adminState[chatId];
}



async function getDB() {
  await client.connect();

  return {
    files: client.db("telegramBot").collection("files"),
    notes: client.db("telegramBot").collection("notes"),
    users: client.db("telegramBot").collection("users"),
    history: client.db("telegramBot").collection("history"),
    searches: client.db("telegramBot").collection("searches"),
    counters: client.db("telegramBot").collection("counters"),

    nodes: client.db("telegramBot").collection("nodes"),
    attachments: client.db("telegramBot").collection("attachments"),
    share_links: client.db("telegramBot").collection("share_links"),
    settings: client.db("telegramBot").collection("settings")
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



async function getNextNodeId(db) {
  const result =
    await db.counters.findOneAndUpdate(
      { _id: "nodes" },
      { $inc: { value: 1 } },
      {
        upsert: true,
        returnDocument: "after"
      }
    );

  return "N" + String(
    result.value
  ).padStart(4, "0");
}

async function ensureRootNode(db) {

  const existing =
    await db.nodes.findOne({
      public_id: "ROOT"
    });

  if (existing) {
    return;
  }

  await db.nodes.insertOne({
    public_id: "ROOT",
    name: "ROOT",
    parent_id: null,
    position: 0,
    description: "",
    poster_file_id: null,
    poster_media_type: null,
    custom_sort_character: null,
    is_trashed: false,
    created_at: new Date(),
    updated_at: new Date()
  });

  console.log("ROOT node created");
}


async function getNodeDescendants(
  db,
  parentId
) {

  const result = [];

  async function walk(nodeId) {

    const children =
      await db.nodes.find({
        parent_id: nodeId,
        is_trashed: false
      }).toArray();

    for (const child of children) {

      result.push(child);

      await walk(
        child.public_id
      );
    }
  }

  await walk(parentId);

  return result;
}



async function normalizeAttachmentPositions(
  db,
  nodeId
) {

  const files =
    await db.attachments.find({
      node_id: nodeId
    })
    .sort({
      position: 1,
      attached_at: 1
    })
    .toArray();

  let position = 1;

  for (const file of files) {

    await db.attachments.updateOne(
      {
        _id: file._id
      },
      {
        $set: {
          position
        }
      }
    );

    position++;
  }
}




function formatAutoNodeName(
  prefix,
  number,
  paddingLength
) {

  const value =
    paddingLength > 0
      ? String(number).padStart(
          paddingLength,
          "0"
        )
      : String(number);

  return `${prefix}  –  ${value}`;
}




const LIBRARY_PAGE_SIZE = 50;

function getPageSlice(
  items,
  page
) {

  const start =
    (page - 1) *
    LIBRARY_PAGE_SIZE;

  return items.slice(
    start,
    start +
      LIBRARY_PAGE_SIZE
  );
}



function getLibraryTotalPages(
  count
) {

  return Math.max(
    1,
    Math.ceil(
      count /
      LIBRARY_PAGE_SIZE
    )
  );
}




function buildLibraryJumpButtons(
  nodeId,
  page,
  totalPages
) {

  const row = [
    {
      text:
        "ᴶᵁᴹᴾ",
      callback_data:
        "bankai_library_jump_label"
    }
  ];

  let startPage =
    Math.max(
      1,
      page - 2
    );

  let endPage =
    Math.min(
      totalPages,
      startPage + 4
    );

  if (
    endPage - startPage < 4
  ) {

    startPage =
      Math.max(
        1,
        endPage - 4
      );
  }

  for (
    let pnum = startPage;
    pnum <= endPage;
    pnum++
  ) {

    const display =
      pnum === page
        ? String(pnum)
            .split("")
            .map(
              d => ({
                "0":"⓿",
                "1":"❶",
                "2":"❷",
                "3":"❸",
                "4":"❹",
                "5":"❺",
                "6":"❻",
                "7":"❼",
                "8":"❽",
                "9":"❾"
              })[d]
            )
            .join("")
        : `ㅤ${pnum}ㅤ`;

    row.push({
      text: display,
      callback_data:
        `bankai_library_page_${nodeId}_${pnum}`
    });
  }

  return row;
}



function buildAutoNodePreview(
  prefix,
  endNumber,
  paddingLength
) {

  const lines = [];

  const head =
    Math.min(
      4,
      endNumber
    );

  for (
    let i = 1;
    i <= head;
    i++
  ) {

    lines.push(
      formatAutoNodeName(
        prefix,
        i,
        paddingLength
      )
    );
  }

  if (endNumber > 6) {

    lines.push("");
    lines.push("...");
    lines.push("");

    lines.push(
      formatAutoNodeName(
        prefix,
        endNumber - 1,
        paddingLength
      )
    );

    lines.push(
      formatAutoNodeName(
        prefix,
        endNumber,
        paddingLength
      )
    );

  } else {

    for (
      let i = head + 1;
      i <= endNumber;
      i++
    ) {

      lines.push(
        formatAutoNodeName(
          prefix,
          i,
          paddingLength
        )
      );
    }
  }

  return lines.join("\n");
}

function buildNodeText(
  node,
  page,
  totalPages
) {

  return `ROOT > ${node.name}${
    node.description
      ? `

${node.description}`
      : ""
  }

Page ${page}/${totalPages}`;
}


async function renderLibraryMessage(
  chatId,
  messageId,
  text,
  buttons,
  node = null
) {

  if (
    node &&
    node.poster_file_id
  ) {

    console.log(
      "LIBRARY MESSAGE TYPE:",
      {
        text: !!text,
        node: node?.name,
        poster:
          node?.poster_media_type || null
      }
    );

    console.log(
      "MEDIA PATH READY"
    );
  }

  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/editMessageText`,
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: {
        inline_keyboard:
          buttons
      }
    }
  );
}





async function sendNodePoster(
  chatId,
  node,
  caption
) {

  let method =
    "sendPhoto";

  const payload = {
    chat_id: chatId,
    caption
  };

  if (
    node.poster_media_type ===
    "video"
  ) {

    method =
      "sendVideo";

    payload.video =
      node.poster_file_id;
  }

  else if (
    node.poster_media_type ===
    "animation"
  ) {

    method =
      "sendAnimation";

    payload.animation =
      node.poster_file_id;
  }

  else {

    payload.photo =
      node.poster_file_id;
  }

  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/${method}`,
    payload
  );
}

async function renderLibraryRoot(
  db,
  chatId,
  messageId
) {

  const children =
    await db.nodes.find({
      parent_id: "ROOT",
      is_trashed: false
    }).sort({
      position: 1,
      name: 1
    }).toArray();

  const buttons = children.map(
    node => [{
      text: node.name,
      callback_data:
        `lib_open_${node.public_id}`
    }]
  );

  buttons.push([
    {
      text: "➕ Create Child Node",
      callback_data:
        "admin_create_ROOT"
    }
  ]);

  buttons.push([
    {
      text: "⬅ BACK",
      callback_data:
        "back_admin_panel"
    },
    {
      text: "❌ CLOSE",
      callback_data:
        "close_search"
    }
  ]);

  await renderLibraryMessage(
    chatId,
    messageId,
    "ㅤ⛩️  BANKAIㅤ❖ㅤLIBRARYㅤ\n\nROOTㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ",
    buttons
  );
}


async function renderLibraryNode(
  db,
  chatId,
  messageId,
  publicId,
  page = 1
) {

  const node =
    await db.nodes.findOne({
      public_id: publicId,
      is_trashed: false
    });

  if (!node) {
    return;
  }

  const children =
    await db.nodes.find({
      parent_id: node.public_id,
      is_trashed: false
    }).sort({
      position: 1,
      name: 1
    }).toArray();

  const totalPages =
    getLibraryTotalPages(
      children.length
    );

  page = Math.max(
    1,
    Math.min(
      page,
      totalPages
    )
  );

  const pageChildren =
    getPageSlice(
      children,
      page
    );

  const buttons =
    pageChildren.map(
    child => [{
      text: child.name,
      callback_data:
        `lib_open_${child.public_id}_${node.public_id}_${page}`
    }]
  );

  buttons.push([
    {
      text:
        "❮",
      callback_data:
        `bankai_library_prev_${node.public_id}_${page}`
    },
    {
      text:
        `${page}/${totalPages}`,
      callback_data:
        "bankai_library_page_label"
    },
    {
      text:
        "❯",
      callback_data:
        `bankai_library_next_${node.public_id}_${page}`
    }
  ]);

  buttons.push(
    buildLibraryJumpButtons(
      node.public_id,
      page,
      totalPages
    )
  );

  buttons.push([
    {
      text: "➕ Create Child Node",
      callback_data:
        `admin_create_${node.public_id}`
    }
  ]);

  buttons.push([
    {
      text: "⚙ Node Actions",
      callback_data:
        `node_actions_${node.public_id}`
    }
  ]);

  if (
    node.parent_id === "ROOT"
  ) {

    buttons.push([
      {
        text: "⬅ BACK",
        callback_data:
          `lib_back_${node.parent_id}_${page}`
      },
      {
        text: "❌ CLOSE",
        callback_data:
          "close_search"
      }
    ]);

  } else {

    buttons.push([
      {
        text: "⬅ BACK",
        callback_data:
          `lib_back_${node.parent_id}_${page}`
      },
      {
        text: "🏡 N-HOME",
        callback_data:
          "bankai_library"
      },
      {
        text: "❌ CLOSE",
        callback_data:
          "close_search"
      }
    ]);

  }

  await renderLibraryMessage(
    chatId,
    messageId,
    buildNodeText(
      node,
      page,
      totalPages
    ),
    buttons,
    node
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

      const state = adminState[chatId];

      if (
        state &&
        state.action === "create_node"
      ) {

        if (
          Date.now() - state.createdAt >
          180000
        ) {

          delete adminState[chatId];

          await sendMessage(
            chatId,
            "❌ Action timed out."
          );

          return res.sendStatus(200);
        }

        const nodeName = text.trim();

        if (!nodeName) {
          return res.sendStatus(200);
        }

        const publicId =
          await getNextNodeId(db);

        const lastNode =
          await db.nodes.find({
            parent_id:
              state.parentNodeId
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        const nextPosition =
          lastNode.length
            ? lastNode[0].position + 1
            : 1;

        await db.nodes.insertOne({
          public_id: publicId,
          name: nodeName,
          parent_id:
            state.parentNodeId,
          position:
            nextPosition,
          description: "",
          poster_file_id: null,
          custom_sort_character: null,
          is_trashed: false,
          created_at: new Date(),
          updated_at: new Date()
        });

        delete adminState[chatId];

        await sendMessage(
          chatId,
          `✅ Node Created\n\n${nodeName}\n(${publicId})`
        );

        return res.sendStatus(200);
      }




      if (
        state &&
        state.action ===
          "auto_node_prefix"
      ) {

        if (
          Date.now() - state.createdAt >
          180000
        ) {

          delete adminState[chatId];

          await sendMessage(
            chatId,
            "❌ Action timed out."
          );

          return res.sendStatus(200);
        }

        const prefix =
          text.trim();

        if (!prefix) {
          return res.sendStatus(200);
        }

        adminState[chatId] = {
          action:
            "auto_node_end",
          parentNodeId:
            state.parentNodeId,
          prefix,
          createdAt:
            Date.now()
        };

        await sendMessage(
          chatId,
`Ending Number ?

Examples :

12
99
366
1000`
        );

        return res.sendStatus(200);
      }



      if (
        state &&
        state.action ===
          "auto_node_end"
      ) {

        if (
          Date.now() - state.createdAt >
          180000
        ) {

          delete adminState[chatId];

          await sendMessage(
            chatId,
            "❌ Action timed out."
          );

          return res.sendStatus(200);
        }

        const endNumber =
          Number(text.trim());

        if (
          !Number.isInteger(
            endNumber
          ) ||
          endNumber < 1 ||
          endNumber > 10000
        ) {

          await sendMessage(
            chatId,
            "❌ Enter a number between 1 and 10000."
          );

          return res.sendStatus(200);
        }

        adminState[chatId] = {
          action:
            "auto_node_padding",
          parentNodeId:
            state.parentNodeId,
          prefix:
            state.prefix,
          endNumber,
          createdAt:
            Date.now()
        };

        await sendMessage(
          chatId,
`Padding ?

YES = DYNAMIC : 001, 002, 003

NO = 1, 2, 3`,
          {
            inline_keyboard: [
              [
                {
                  text: "✅ YES",
                  callback_data:
                    `auto_padding_yes_${chatId}`
                }
              ],
              [
                {
                  text: "❌ NO",
                  callback_data:
                    `auto_padding_no_${chatId}`
                }
              ],
              [
                {
                  text: "❌ CLOSE",
                  callback_data:
                    "close_search"
                }
              ]
            ]
          }
        );

        return res.sendStatus(200);
      }



      if (
        state &&
        state.action ===
          "auto_node_padding"
      ) {

        return res.sendStatus(200);

        const paddingLength =
          answer === "YES"
            ? String(
                state.endNumber
              ).length
            : 0;

        const preview =
          buildAutoNodePreview(
            state.prefix,
            state.endNumber,
            paddingLength
          );

        adminState[chatId] = {
          action:
            "auto_node_confirm",
          parentNodeId:
            state.parentNodeId,
          prefix:
            state.prefix,
          endNumber:
            state.endNumber,
          paddingLength,

          backPrefix:
            state.prefix,

          backEndNumber:
            state.endNumber,

          createdAt:
            Date.now()
        };

        await sendMessage(
          chatId,
`Preview

${preview}

Total Nodes : ${state.endNumber}`,
          {
            inline_keyboard: [
              [
                {
                  text:
                    "✅ CREATE",
                  callback_data:
                    `auto_create_confirm_${chatId}`
                },
                {
                  text:
                    "🔙 BACK",
                  callback_data:
                    `auto_create_back_${chatId}`
                }
              ],
              [
                {
                  text:
                    "❎ CANCEL",
                  callback_data:
                    `auto_create_cancel_${chatId}`
                }
              ],
              [
                {
                  text:
                    "❌ CLOSE",
                  callback_data:
                    "close_search"
                }
              ]
            ]
          }
        );

        return res.sendStatus(200);
      }




      if (
        state &&
        state.action ===
          "auto_node_confirm"
      ) {

        return res.sendStatus(200);

        const lastNode =
          await db.nodes.find({
            parent_id:
              state.parentNodeId
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        let position =
          lastNode.length
            ? lastNode[0].position + 1
            : 1;

        for (
          let i = 1;
          i <= state.endNumber;
          i++
        ) {

          const publicId =
            await getNextNodeId(db);

          const nodeName =
            formatAutoNodeName(
              state.prefix,
              i,
              state.paddingLength
            );

          await db.nodes.insertOne({
            public_id: publicId,
            name: nodeName,
            parent_id:
              state.parentNodeId,
            position,
            description: "",
            poster_file_id: null,
            custom_sort_character: null,
            is_trashed: false,
            created_at:
              new Date(),
            updated_at:
              new Date()
          });

          position++;
        }

        delete adminState[
          chatId
        ];

        await sendMessage(
          chatId,
`✅ Auto Nodes Created

Prefix :
${state.prefix}

Created :
${state.endNumber}`
        );

        return res.sendStatus(200);
      }


      const nodeAction =
        nodeActionState[chatId];

      if (
        nodeAction &&
        nodeAction.action ===
          "rename_node"
      ) {

        const newName =
          text.trim();

        if (!newName) {

          return res.sendStatus(200);
        }

        const node =
          await db.nodes.findOne({
            public_id:
              nodeAction.publicId,
            is_trashed: false
          });

        if (!node) {

          nodeActionState[
            chatId
          ] = null;

          await sendMessage(
            chatId,
            "❌ Node not found."
          );

          return res.sendStatus(200);
        }

        await db.nodes.updateOne(
          {
            public_id:
              nodeAction.publicId
          },
          {
            $set: {
              name: newName,
              updated_at:
                new Date()
            }
          }
        );

        nodeActionState[
          chatId
        ] = null;

        await sendMessage(
          chatId,
`✅ Node Renamed

Old:
${node.name}

New:
${newName}`
        );

        return res.sendStatus(200);
      }



      if (
        nodeAction &&
        nodeAction.action ===
          "edit_description"
      ) {

        const description =
          text.trim();

        const node =
          await db.nodes.findOne({
            public_id:
              nodeAction.publicId,
            is_trashed: false
          });

        if (!node) {

          nodeActionState[
            chatId
          ] = null;

          await sendMessage(
            chatId,
            "❌ Node not found."
          );

          return res.sendStatus(200);
        }

        await db.nodes.updateOne(
          {
            public_id:
              nodeAction.publicId
          },
          {
            $set: {
              description,
              updated_at:
                new Date()
            }
          }
        );

        nodeActionState[
          chatId
        ] = null;

        await sendMessage(
          chatId,
`✅ Description Updated

Node:
${node.name}`
        );

        return res.sendStatus(200);
      }



      const posterState =
        nodePosterState[chatId];

      if (
        posterState &&
        String(chatId) ===
          String(ADMIN_ID)
      ) {

        let posterFileId = null;
        let posterMediaType = null;

        if (msg.photo) {

          const photo =
            msg.photo[
              msg.photo.length - 1
            ];

          posterFileId =
            photo.file_id;

          posterMediaType =
            "photo";
        }

        else if (msg.video) {

          posterFileId =
            msg.video.file_id;

          posterMediaType =
            "video";
        }

        else if (msg.animation) {

          posterFileId =
            msg.animation.file_id;

          posterMediaType =
            "animation";
        }

        if (!posterFileId) {
          return res.sendStatus(200);
        }

        await db.nodes.updateOne(
          {
            public_id:
              posterState.publicId
          },
          {
            $set: {
              poster_file_id:
                posterFileId,
              poster_media_type:
                posterMediaType,
              updated_at:
                new Date()
            }
          }
        );

        nodePosterState[
          chatId
        ] = null;

        await sendMessage(
          chatId,
          "✅ Poster Updated"
        );

        return res.sendStatus(200);
      }



      const existingUser =
        await db.users.findOne({
          chat_id: chatId
        });

      if (
        existingUser &&
        existingUser.banned === true
      ) {

        return res.sendStatus(200);
      }



      const attachState =
        nodeFilesState[chatId];

      if (
        attachState &&
        attachState.action ===
          "attach_files" &&
        String(chatId) ===
          String(ADMIN_ID)
      ) {

        let file = null;

        if (msg.document) {

          file = {
            file_id:
              msg.document.file_id,
            file_name:
              msg.document.file_name ||
              "Unnamed File",
            media_type:
              "document"
          };
        }

        else if (msg.audio) {

          file = {
            file_id:
              msg.audio.file_id,
            file_name:
              msg.audio.file_name ||
              msg.audio.title ||
              "Unnamed Audio",
            media_type:
              "audio"
          };
        }

        else if (msg.video) {

          file = {
            file_id:
              msg.video.file_id,
            file_name:
              msg.video.file_name ||
              "Unnamed Video",
            media_type:
              "video"
          };
        }

        else if (msg.photo) {

          const photo =
            msg.photo[
              msg.photo.length - 1
            ];

          file = {
            file_id:
              photo.file_id,
            file_name:
              "Photo",
            media_type:
              "photo"
          };
        }

        else if (msg.animation) {

          file = {
            file_id:
              msg.animation.file_id,
            file_name:
              msg.animation.file_name ||
              "GIF",
            media_type:
              "animation"
          };
        }

        else if (msg.sticker) {

          file = {
            file_id:
              msg.sticker.file_id,
            file_name:
              "Sticker",
            media_type:
              "sticker"
          };
        }

        else if (msg.voice) {

          file = {
            file_id:
              msg.voice.file_id,
            file_name:
              "Voice Message",
            media_type:
              "voice"
          };
        }

        if (file) {

          attachState.files.push(
            file
          );

          await sendMessage(
            chatId,
            `📎 Queued: ${file.file_name}`
          );
        }

        return res.sendStatus(200);
      }



      if (uploadMode[chatId] && String(chatId) === String(ADMIN_ID)) {

        let file = null;

        const type = uploadType[chatId];

        if (type === "document" && msg.document) {

          file = {
            file_id: msg.document.file_id,
            file_name:
              msg.document.file_name || "Unnamed File",
            media_type: "document"
          };
        }

        else if (type === "music" && msg.audio) {

          file = {
            file_id: msg.audio.file_id,
            file_name:
              msg.audio.file_name ||
              msg.audio.title ||
              "Unnamed Music",
            media_type: "audio"
          };
        }

        else if (type === "video" && msg.video) {

          file = {
            file_id: msg.video.file_id,
            file_name:
              msg.video.file_name || "Unnamed Video",
            media_type: "video"
          };
        }

        else if (type === "picture" && msg.photo) {

          const photo =
            msg.photo[msg.photo.length - 1];

          file = {
            file_id: photo.file_id,
            file_name: "Photo",
            media_type: "photo"
          };
        }

        else if (type === "gif" && msg.animation) {

          file = {
            file_id: msg.animation.file_id,
            file_name:
              msg.animation.file_name || "GIF",
            media_type: "animation"
          };
        }

        else if (type === "sticker" && msg.sticker) {

          file = {
            file_id: msg.sticker.file_id,
            file_name: "Sticker",
            media_type: "sticker"
          };
        }

        else if (type === "audio" && msg.voice) {

          file = {
            file_id: msg.voice.file_id,
            file_name: "Voice Message",
            media_type: "voice"
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

          const genericNames = [
            "Unnamed Video",
            "GIF",
            "Sticker",
            "Voice Message"
          ];

          if (
            genericNames.includes(
              file.file_name
            )
          ) {

            let counterType = null;
            let extension = "";

            if (
              file.media_type === "video"
            ) {

              counterType = "video";

              extension =
                msg.video?.file_name
                  ?.split(".")
                  .pop();

              extension =
                extension
                  ? `.${extension}`
                  : ".mp4";
            }

            else if (
              file.media_type === "animation"
            ) {

              counterType = "gif";
              extension = ".gif";
            }

            else if (
              file.media_type === "sticker"
            ) {

              counterType = "sticker";
              extension = ".webp";
            }

            else if (
              file.media_type === "voice"
            ) {

              counterType = "voice";
              extension = ".ogg";
            }

            if (counterType) {

              const counter =
                await db.counters.findOneAndUpdate(
                  {
                    type: counterType
                  },
                  {
                    $inc: {
                      current: 1
                    }
                  },
                  {
                    upsert: true,
                    returnDocument: "after"
                  }
                );

              const number =
                String(
                  counter.current
                ).padStart(2, "0");

              file.file_name =
`${counterType.toUpperCase()} . ${number}${extension}`;
            }
          }

          await db.files.insertOne({
            file_id: file.file_id,
            file_name: file.file_name,
            uploaded_at: new Date()
          });

          await db.history.insertOne({
            action: "upload",
            file_id: file.file_id,
            file_name: file.file_name,
            media_type:
              file.media_type || "unknown",
            admin_id: chatId,
            timestamp: new Date()
          });

          await sendMessage(
            chatId,
            `✅ Saved: ${file.file_name}`
          );
        }
      }

      if (
        broadcastMode[chatId] &&
        String(chatId) === String(ADMIN_ID)
      ) {

        const users = await db.users.find({}).toArray();

        let success = 0;
        let failed = 0;

        for (const user of users) {

          try {

            await axios.post(
              `https://api.telegram.org/bot${TOKEN}/copyMessage`,
              {
                chat_id: user.chat_id,
                from_chat_id: chatId,
                message_id: msg.message_id
              }
            );

            success++;

          } catch (err) {

            failed++;
          }
        }

        await sendMessage(
          chatId,
          `📢 Broadcast completed.\n\n✅ Success: ${success}\n❌ Failed: ${failed}`
        );

        return res.sendStatus(200);
      }


      

      if (
        banMode[chatId] &&
        String(chatId) === String(ADMIN_ID)
      ) {

        const targetId = text.trim();

        if (!/^\d+$/.test(targetId)) {

          banMode[chatId] = false;

          const sent = await sendMessage(
            chatId,
            "❌ Invalid Chat ID."
          );

          setTimeout(async () => {

            try {

              await axios.post(
                `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
                {
                  chat_id: chatId,
                  message_id:
                    sent.data.result.message_id
                }
              );

            } catch {}

          }, 45000);

          return res.sendStatus(200);
        }

        pendingBanId[chatId] =
          targetId;

        banMode[chatId] = false;

        await sendMessage(
          chatId,
`⚠ Confirm Ban?

User ID: ${targetId}`,
          {
            inline_keyboard: [
              [
                {
                  text: "✅ Confirm Ban",
                  callback_data:
                    `confirm_ban_${targetId}`
                }
              ],
              [
                {
                  text: "❌ Cancel",
                  callback_data:
                    "cancel_ban"
                }
              ]
            ]
          }
        );

        return res.sendStatus(200);
      }


if (command.startsWith("/start")) {

        await db.users.updateOne(
          { chat_id: chatId },
          {
            $set: {
              chat_id: chatId,
              first_name: msg.from.first_name || "",
              username: msg.from.username || "",
              joined_at: new Date()
            }
          },
          { upsert: true }
        );

        const user_name = msg.from.first_name || "User";

        const caption =
`<b>Konnichiwa, ${user_name}</b> 👋

I'm TpX Bot.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: " 🔒 Close ",
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
          const sent = await sendMessage(
            chatId,
            "Usage: /search keyword"
          );

          setTimeout(async () => {

            try {

              await axios.post(
                `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
                {
                  chat_id: chatId,
                  message_id:
                    sent.data.result.message_id
                }
              );

            } catch {}

          }, 45000);
          return res.sendStatus(200);
        }

        await db.searches.insertOne({
          user_id: chatId,
          first_name:
            msg.from.first_name || "",
          username:
            msg.from.username || "",
          keyword: keyword,
          timestamp: new Date()
        });

        const results = await db.files.find({
          file_name: {
            $regex: keyword,
            $options: "i"
          }
        }).limit(8).toArray();

        if (!results.length) {
          const sent = await sendMessage(
            chatId,
            "❌ No files found."
          );

          setTimeout(async () => {

            try {

              await axios.post(
                `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
                {
                  chat_id: chatId,
                  message_id:
                    sent.data.result.message_id
                }
              );

            } catch {}

          }, 45000);
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
            text: " 🔒 Close ",
            callback_data: "close_search"
          }
        ]);

        await sendMessage(
          chatId,
          `🔎 ${keyword}ㅤㅤㅤㅤㅤㅤㅤㅤ`,
          {
            inline_keyboard: buttons
          }
        );
      }

      
      if (
        command.startsWith(
          "/allsearch"
        )
      ) {

        if (
          String(chatId)
          !==
          String(ADMIN_ID)
        ) {

          return res.sendStatus(200);
        }

        const keyword =
          text
            .split(" ")
            .slice(1)
            .join(" ")
            .trim();

        if (!keyword) {

          const sent = await sendMessage(
            chatId,
            "Usage: /allsearch keyword"
          );

          setTimeout(async () => {

            try {

              await axios.post(
                `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
                {
                  chat_id: chatId,
                  message_id:
                    sent.data.result.message_id
                }
              );

            } catch {}

          }, 45000);

          return res.sendStatus(200);
        }

        setTimeout(async () => {

          try {

            await axios.post(
              `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
              {
                chat_id: chatId,
                message_id:
                  msg.message_id
              }
            );

          } catch {}
        }, 45000);

        const limit = 5;

        const totalResults =
          await db.history.countDocuments({
            file_name: {
              $regex: keyword,
              $options: "i"
            }
          });

        const totalPages =
          Math.max(
            1,
            Math.ceil(
              totalResults / limit
            )
          );

        const results =
          await db.history.find({
            file_name: {
              $regex: keyword,
              $options: "i"
            }
          })
          .sort({
            timestamp: -1
          })
          .limit(limit)
          .toArray();

        if (!results.length) {

          const sent = await sendMessage(
            chatId,
            "❌ No history found."
          );

          setTimeout(async () => {

            try {

              await axios.post(
                `https://api.telegram.org/bot${TOKEN}/deleteMessage`,
                {
                  chat_id: chatId,
                  message_id:
                    sent.data.result.message_id
                }
              );

            } catch {}

          }, 45000);

          return res.sendStatus(200);
        }

        let resultText =
          `🔎 History Search: ${keyword}ㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ`;

        const buttons = [];

        results.forEach((item) => {

          const icon =
            item.action === "delete"
              ? "🗑️"
              : "📤";

          const lower =
            (item.file_name || "")
              .toLowerCase();

          let mediaEmoji = "📂";

          if (
            [
              ".mp3",
              ".m4a",
              ".flac",
              ".wav",
              ".aac",
              ".ogg",
              ".opus",
              ".alac",
              ".wma",
              ".aiff"
            ].some(ext =>
              lower.endsWith(ext)
            )
          ) {

            mediaEmoji = "🎵";
          }

          else if (
            item.media_type === "voice"
          ) {

            mediaEmoji = "🔊";
          }

          else if (
            [
              ".mp4",
              ".mkv",
              ".avi",
              ".mov",
              ".webm",
              ".flv",
              ".wmv",
              ".m4v",
              ".3gp",
              ".ts"
            ].some(ext =>
              lower.endsWith(ext)
            )
          ) {

            mediaEmoji = "🎬";
          }

          else if (
            item.media_type === "sticker"
          ) {

            mediaEmoji = "🎭";
          }

          else if (
            lower.endsWith(".gif")
            ||
            item.media_type === "animation"
          ) {

            mediaEmoji = "👾";
          }

          const shortAction =
            item.action === "delete"
              ? "DLT"
              : "UP";

          buttons.push([
            {
              text:
`${icon} ${shortAction} ${mediaEmoji} • ${item.file_name.slice(0, 55)}`,

              callback_data:
                `historyfile_${item._id}`
            }
          ]);
        });

        buttons.push([
          {
            text: "❮",
            callback_data: "noop"
          },
          {
            text:
              `1/${totalPages}`,
            callback_data: "noop"
          },
          {
            text: "❯",
            callback_data:
              totalPages > 1
                ? `allsearch_${keyword}_2`
                : "noop"
          }
        ]);

        buttons.push([
          {
            text: " 🔒 Close ",
            callback_data:
              "close_search"
          }
        ]);

        await sendMessage(
          chatId,
          resultText,
          {
            inline_keyboard:
              buttons
          }
        );

        return res.sendStatus(200);
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
          "⚙️ Admin Panel",
          {
            inline_keyboard: [
              [
                {
                  text: " ㅤ⛩️  BANKAIㅤ❖ㅤLIBRARYㅤ ",
                  callback_data: "bankai_library"
                }
              ],

              [
                {
                  text: " 🗃️ Upload ",
                  callback_data: "admin_upload"
                },
                {
                  text: "I",
                  callback_data: "noop"
                }
              ],

              [
                {
                  text: " 📢 Broadcast ",
                  callback_data: "admin_broadcast"
                },
                {
                  text: "II",
                  callback_data: "noop"
                }
              ],

              [
                {
                  text: " 📊 User Stats ",
                  callback_data: "user_stats"
                },
                {
                  text: "III",
                  callback_data: "noop"
                }
              ],

              [
                {
                  text: " 🔨 Ban User ",
                  callback_data: "ban_user"
                },
                {
                  text: "IV",
                  callback_data: "noop"
                }
              ],

              [
                {
                  text: " 🚫 Banned Users ",
                  callback_data: "banned_users"
                },
                {
                  text: " 🔎 Search History ",
                  callback_data: "search_history"
                }
              ],

              [
                {
                  text:
                    " 🕘 View Upload/Delete History ",
                  callback_data: "upload_history"
                }
              ],

              [
                {
                  text: " 🔒 Close ",
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

        clearAdminStates(
          query.message.chat.id
        );

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

        clearAdminStates(
          query.message.chat.id
        );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Uploadㅤㅤㅤㅤㅤㅤㅤㅤ",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: " File / Document / etc. ",
                    callback_data: "upload_document"
                  }
                ],

                [
                  {
                    text: " Audio ",
                    callback_data: "upload_audio"
                  },
                  {
                    text: " Video ",
                    callback_data: "upload_video"
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
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]

              ]
            }
          }
        );

        return res.sendStatus(200);
      }



      

      

      if (query.data === "user_stats") {

        const totalUsers =
          await db.users.countDocuments();

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
`📊 User Statistics

👥 Total Users: ${totalUsers}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      `👥 Total Users (${totalUsers})`,
                    callback_data: "total_users"
                  }
                ],

                [
                  {
                    text:
                      " 🔎 All Users Searches ",
                    callback_data:
                      "all_users_searches"
                  }
                ],

                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (query.data === "total_users") {

        const users = await db.users
          .find({})
          .limit(5)
          .toArray();

        const totalUsers =
          await db.users.countDocuments();

        const buttons = users.map((user) => {

          const name =
            user.first_name || "Unknown";

          const username =
            user.username
              ? ` (@${user.username})`
              : "";

          return [
            {
              text:
                `👤 ${name}${username}`,
              callback_data:
                `view_user_${user.chat_id}`
            }
          ];
        });

        buttons.push([
          {
            text:
              `❮ 1/${Math.ceil(totalUsers / 5)} ❯`,
            callback_data: "noop"
          }
        ]);

        buttons.push([
          {
            text: "⬅ Back",
            callback_data: "user_stats"
          },
          {
            text: " 🔒 Close ",
            callback_data: "close_search"
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
`👥 Total Users List

Showing first 5 users.`,
            reply_markup: {
              inline_keyboard: buttons
            }
          }
        );

        return res.sendStatus(200);
      }




      if (query.data.startsWith("view_user_")) {

        const chatIdToFind =
          Number(
            query.data.replace(
              "view_user_",
              ""
            )
          );

        const user =
          await db.users.findOne({
            chat_id: chatIdToFind
          });

        if (!user) {

          return res.sendStatus(200);
        }

        const userText =
          Object.entries(user)
            .map(([key, value]) => {

              if (
                value &&
                typeof value === "object"
              ) {

                value =
                  JSON.stringify(value);
              }

              return `${key}: ${value}`;
            })
            .join("\n");

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
`📄 User Data

${userText}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data: "total_users"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data ===
        "all_users_searches"
      ) {

        const users =
          await db.searches.aggregate([
            {
              $group: {
                _id: "$user_id",
                first_name: {
                  $first:
                    "$first_name"
                },
                username: {
                  $first:
                    "$username"
                }
              }
            },
            {
              $limit: 20
            }
          ]).toArray();

        const buttons =
          users.map((user) => {

            const username =
              user.username
                ? ` (@${user.username})`
                : "";

            return [
              {
                text:
                  `👤 ${user.first_name}${username}`,

                callback_data:
                  `view_searches_${user._id}`
              }
            ];
          });

        buttons.push([
          {
            text: "⬅ Back",
            callback_data:
              "user_stats"
          },
          {
            text: " 🔒 Close ",
            callback_data:
              "close_search"
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,

            message_id:
              query.message.message_id,

            text:
`🔎 All Users Searches

Select a user.`,

            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data.startsWith(
          "view_searches_"
        )
      ) {

        const userId =
          Number(
            query.data.replace(
              "view_searches_",
              ""
            )
          );

        const searches =
          await db.searches.find({
            user_id: userId
          })
          .sort({
            timestamp: -1
          })
          .limit(20)
          .toArray();

        if (!searches.length) {

          return res.sendStatus(200);
        }

        let textMessage =
          `🔎 User Searches\n\n`;

        searches.forEach((item) => {

          textMessage +=
`${item.keyword}
${new Date(item.timestamp).toLocaleString()}

`;
        });

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,

            message_id:
              query.message.message_id,

            text:
              textMessage,

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "all_users_searches"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (query.data === "ban_user") {

        banMode[query.message.chat.id] = true;

        pendingBanId[
          query.message.chat.id
        ] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
`🔨 Ban User

Send the user Chat ID you want to ban.`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data.startsWith(
          "confirm_ban_"
        )
      ) {

        const targetId =
          Number(
            query.data.replace(
              "confirm_ban_",
              ""
            )
          );

        await db.users.updateOne(
          {
            chat_id: targetId
          },
          {
            $set: {
              banned: true
            }
          }
        );

        pendingBanId[
          query.message.chat.id
        ] = null;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
`✅ User banned successfully.

User ID: ${targetId}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



      if (query.data === "cancel_ban") {

        pendingBanId[
          query.message.chat.id
        ] = null;

        banMode[
          query.message.chat.id
        ] = false;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
              "❌ Ban cancelled.",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (query.data === "banned_users") {

        const users = await db.users
          .find({
            banned: true
          })
          .toArray();

        const buttons = users.map((user) => {

          const name =
            user.first_name || "Unknown";

          const username =
            user.username
              ? ` (@${user.username})`
              : "";

          return [
            {
              text:
                `👤 ${name}${username}`,
              callback_data:
                `unban_user_${user.chat_id}`
            }
          ];
        });

        buttons.push([
          {
            text: "⬅ Back",
            callback_data:
              "back_admin_panel"
          },
          {
            text: " 🔒 Close ",
            callback_data:
              "close_search"
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
              "🚫 Banned Users List",
            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data.startsWith(
          "unban_user_"
        )
      ) {

        const targetId =
          Number(
            query.data.replace(
              "unban_user_",
              ""
            )
          );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⚠ Confirm Unban?

User ID: ${targetId}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ Confirm Unban",
                    callback_data:
                      `confirm_unban_${targetId}`
                  }
                ],
                [
                  {
                    text: "❌ Cancel",
                    callback_data:
                      "cancel_unban"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data.startsWith(
          "confirm_unban_"
        )
      ) {

        const targetId =
          Number(
            query.data.replace(
              "confirm_unban_",
              ""
            )
          );

        await db.users.updateOne(
          {
            chat_id: targetId
          },
          {
            $unset: {
              banned: ""
            }
          }
        );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`✅ User unbanned successfully.

User ID: ${targetId}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "banned_users"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



      if (
        query.data === "cancel_unban"
      ) {

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
              "❌ Unban cancelled.",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "banned_users"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




      if (
        query.data ===
          "upload_history"
        ||
        query.data.startsWith(
          "history_page_"
        )
      ) {

        let page = 1;

        if (
          query.data.startsWith(
            "history_page_"
          )
        ) {

          page = Number(
            query.data.replace(
              "history_page_",
              ""
            )
          );
        }

        const limit = 5;

        const totalHistory =
          await db.history
            .countDocuments();

        const totalPages =
          Math.max(
            1,
            Math.ceil(
              totalHistory / limit
            )
          );

        const history =
          await db.history
            .find({})
            .sort({
              timestamp: -1
            })
            .skip(
              (page - 1) * limit
            )
            .limit(limit)
            .toArray();

        let historyText =
          `📄 History Page ${page}/${totalPages}\n\n`;

        if (!history.length) {

          historyText +=
            "No history found.";
        }

        else {

          history.forEach((item) => {

            historyText +=
`${item.action.toUpperCase()} • ${item.file_name}
${item.media_type} • ${new Date(item.timestamp).toLocaleString()}

`;
          });
        }

        const buttons = [];

        buttons.push([
          {
            text: "❮",
            callback_data:
              page > 1
                ? `history_page_${page - 1}`
                : "noop"
          },
          {
            text:
              `${page}/${totalPages}`,
            callback_data: "noop"
          },
          {
            text: "❯",
            callback_data:
              page < totalPages
                ? `history_page_${page + 1}`
                : "noop"
          }
        ]);

        buttons.push([
          {
            text: "⬅ Back",
            callback_data:
              "back_admin_panel"
          },
          {
            text: " 🔒 Close ",
            callback_data:
              "close_search"
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text: historyText,
            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }


      if (
        query.data ===
        "search_history"
      ) {

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`🔎 History Search Console

Use:
/allsearch keyword

Example:
/allsearch bleach`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data:
                      "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


if (query.data === "admin_broadcast") {

        broadcastMode[query.message.chat.id] = false;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Broadcast Confirmation",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Are you sure? If yes then tap 🕹️",
                    callback_data: "confirm_broadcast"
                  }
                ],
                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


      if (query.data === "confirm_broadcast") {

        broadcastMode[query.message.chat.id] = true;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text:
              "Broadcast mode active.",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "❌ Stop Broadcast",
                    callback_data: "stop_broadcast"
                  }
                ],
                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


      if (query.data === "stop_broadcast") {

        broadcastMode[query.message.chat.id] = false;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "Broadcast stopped.",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⬅ Back",
                    callback_data: "back_admin_panel"
                  },
                  {
                    text: " 🔒 Close ",
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
                    text: " 🔒 Close ",
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

        clearAdminStates(
          query.message.chat.id
        );

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
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


if (query.data === "bankai_library") {


        await renderLibraryRoot(
          db,
          query.message.chat.id,
          query.message.message_id
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "admin_create_"
        )
      ) {

        const parentNodeId =
          query.data.replace(
            "admin_create_",
            ""
          );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Choose Mode`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "ㅤBASICㅤ",
                    callback_data:
                      `create_basic_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "ㅤPOWERFULㅤ❖ㅤAUTOMATEDㅤ",
                    callback_data:
                      `create_powerful_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "🔙  BACK",
                    callback_data:
                      `lib_open_${parentNodeId}`
                  },
                  {
                    text:
                      "✖️  CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "create_basic_"
        )
      ) {

        const parentNodeId =
          query.data.replace(
            "create_basic_",
            ""
          );

        adminState[
          query.message.chat.id
        ] = {
          action: "create_node",
          parentNodeId,
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Enter Node Name :ㅤㅤㅤㅤㅤㅤㅤㅤ

Example :

Episode
Series
Get All
⛩️  ANIME`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🔙  BACK",
                    callback_data:
                      `basic_back_${parentNodeId}`
                  },
                  {
                    text:
                      "❎  CANCEL",
                    callback_data:
                      `basic_cancel_${parentNodeId}`
                  },
                  {
                    text:
                      "❌  CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "create_powerful_"
        )
      ) {

        const parentNodeId =
          query.data.replace(
            "create_powerful_",
            ""
          );

        adminState[
          query.message.chat.id
        ] = {
          action:
            "auto_node_prefix",
          parentNodeId,
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Node Prefix ?

Examples :

Episode
OVA
Movie
Season
Part`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🔙  BACK",
                    callback_data:
                      `basic_back_${parentNodeId}`
                  },
                  {
                    text:
                      "❎  CANCEL",
                    callback_data:
                      `basic_cancel_${parentNodeId}`
                  },
                  {
                    text:
                      "❌  CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }


if (
        query.data.startsWith(
          "basic_back_"
        )
      ) {

        const parentNodeId =
          query.data.replace(
            "basic_back_",
            ""
          );

        delete adminState[
          query.message.chat.id
        ];

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Choose Mode`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "ㅤBASICㅤ",
                    callback_data:
                      `create_basic_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "ㅤPOWERFULㅤ❖ㅤAUTOMATEDㅤ",
                    callback_data:
                      `create_powerful_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "🔙  BACK",
                    callback_data:
                      `lib_open_${parentNodeId}`
                  },
                  {
                    text:
                      "✖️  CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "basic_cancel_"
        )
      ) {

        delete adminState[
          query.message.chat.id
        ];

        await renderLibraryRoot(
          db,
          query.message.chat.id,
          query.message.message_id
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "auto_create_cancel_"
        )
      ) {

        const state =
          adminState[
            query.message.chat.id
          ];

        const parentNodeId =
          state?.parentNodeId ||
          "ROOT";

        delete adminState[
          query.message.chat.id
        ];

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Choose Mode`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "ㅤBASICㅤ",
                    callback_data:
                      `create_basic_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "ㅤPOWERFULㅤ❖ㅤAUTOMATEDㅤ",
                    callback_data:
                      `create_powerful_${parentNodeId}`
                  }
                ],
                [
                  {
                    text:
                      "🔙  BACK",
                    callback_data:
                      `lib_open_${parentNodeId}`
                  },
                  {
                    text:
                      "✖️  CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "auto_create_back_"
        )
      ) {

        const parentNodeId =
          query.data.replace(
            "auto_create_back_",
            ""
          );

        const oldState =
          adminState[
            query.message.chat.id
          ];

        delete adminState[
          query.message.chat.id
        ];

        adminState[
          query.message.chat.id
        ] = {
          action:
            "auto_node_padding",

          parentNodeId:
            oldState.parentNodeId,

          prefix:
            oldState.backPrefix,

          endNumber:
            oldState.backEndNumber,

          createdAt:
            Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Padding ?

YES = DYNAMIC : 001, 002, 003

NO = 1, 2, 3`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ YES",
                    callback_data:
                      `auto_padding_yes_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text: "❌ NO",
                    callback_data:
                      `auto_padding_no_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text: "❌ CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }





if (
        query.data.startsWith(
          "auto_padding_yes_"
        )
      ) {

        const state =
          adminState[
            query.message.chat.id
          ];

        if (
          !state ||
          state.action !==
            "auto_node_padding"
        ) {

          return res.sendStatus(200);
        }

        const paddingLength =
          String(
            state.endNumber
          ).length;

        const preview =
          buildAutoNodePreview(
            state.prefix,
            state.endNumber,
            paddingLength
          );

        adminState[
          query.message.chat.id
        ] = {
          action:
            "auto_node_confirm",
          parentNodeId:
            state.parentNodeId,
          prefix:
            state.prefix,
          endNumber:
            state.endNumber,
          paddingLength,
          backPrefix:
            state.prefix,
          backEndNumber:
            state.endNumber,
          createdAt:
            Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Preview

${preview}

Total Nodes : ${state.endNumber}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ CREATE",
                    callback_data:
                      `auto_create_confirm_${query.message.chat.id}`
                  },
                  {
                    text:
                      "🔙 BACK",
                    callback_data:
                      `auto_create_back_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text:
                      "❎ CANCEL",
                    callback_data:
                      `auto_create_cancel_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text:
                      "❌ CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "auto_padding_no_"
        )
      ) {

        const state =
          adminState[
            query.message.chat.id
          ];

        if (
          !state ||
          state.action !==
            "auto_node_padding"
        ) {

          return res.sendStatus(200);
        }

        const paddingLength = 0;

        const preview =
          buildAutoNodePreview(
            state.prefix,
            state.endNumber,
            paddingLength
          );

        adminState[
          query.message.chat.id
        ] = {
          action:
            "auto_node_confirm",
          parentNodeId:
            state.parentNodeId,
          prefix:
            state.prefix,
          endNumber:
            state.endNumber,
          paddingLength,
          backPrefix:
            state.prefix,
          backEndNumber:
            state.endNumber,
          createdAt:
            Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`Preview

${preview}

Total Nodes : ${state.endNumber}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ CREATE",
                    callback_data:
                      `auto_create_confirm_${query.message.chat.id}`
                  },
                  {
                    text:
                      "🔙 BACK",
                    callback_data:
                      `auto_create_back_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text:
                      "❎ CANCEL",
                    callback_data:
                      `auto_create_cancel_${query.message.chat.id}`
                  }
                ],
                [
                  {
                    text:
                      "❌ CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "auto_create_confirm_"
        )
      ) {

        const state =
          adminState[
            query.message.chat.id
          ];

        if (
          !state ||
          state.action !==
            "auto_node_confirm"
        ) {

          return res.sendStatus(200);
        }

        delete adminState[
          query.message.chat.id
        ];

        const lastNode =
          await db.nodes.find({
            parent_id:
              state.parentNodeId
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        let position =
          lastNode.length
            ? lastNode[0].position + 1
            : 1;

        for (
          let i = 1;
          i <= state.endNumber;
          i++
        ) {

          const publicId =
            await getNextNodeId(db);

          const nodeName =
            formatAutoNodeName(
              state.prefix,
              i,
              state.paddingLength
            );

          await db.nodes.insertOne({
            public_id: publicId,
            name: nodeName,
            parent_id:
              state.parentNodeId,
            position,
            description: "",
            poster_file_id: null,
            custom_sort_character: null,
            is_trashed: false,
            created_at:
              new Date(),
            updated_at:
              new Date()
          });

          position++;
        }

        delete adminState[
          query.message.chat.id
        ];

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`✅ Auto Nodes Created

Prefix :
${state.prefix}

Created :
${state.endNumber}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "🏡 HOME",
                    callback_data:
                      "bankai_library"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }




if (
        query.data.startsWith(
          "bankai_library_page_"
        )
      ) {

        const parts =
          query.data.split("_");

        const page =
          Number(
            parts.pop()
          );

        const nodeId =
          parts.pop();

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          nodeId,
          page
        );

        return res.sendStatus(200);
      }



if (query.data.startsWith("lib_open_")) {

        const parts =
          query.data.replace(
            "lib_open_",
            ""
          ).split("_");

        const publicId =
          parts[0];

        if (publicId === "ROOT") {

          await renderLibraryRoot(
            db,
            query.message.chat.id,
            query.message.message_id
          );

        } else {

          await renderLibraryNode(
            db,
            query.message.chat.id,
            query.message.message_id,
            publicId
          );
        }

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "bankai_library_prev_"
        )
      ) {

        const parts =
          query.data.split("_");

        const page =
          Number(
            parts.pop()
          );

        const nodeId =
          parts.pop();

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          nodeId,
          page - 1
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "bankai_library_next_"
        )
      ) {

        const parts =
          query.data.split("_");

        const page =
          Number(
            parts.pop()
          );

        const nodeId =
          parts.pop();

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          nodeId,
          page + 1
        );

        return res.sendStatus(200);
      }



if (query.data.startsWith("lib_back_")) {

        const parts =
          query.data.replace(
            "lib_back_",
            ""
          ).split("_");

        const page =
          Number(
            parts.pop()
          );

        const parentId =
          parts.join("_");

        if (parentId === "ROOT") {

          await renderLibraryRoot(
            db,
            query.message.chat.id,
            query.message.message_id
          );

        } else {

          await renderLibraryNode(
            db,
            query.message.chat.id,
            query.message.message_id,
            parentId,
            page
          );
        }

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "node_actions_"
        )
      ) {

        const publicId =
          query.data.replace(
            "node_actions_",
            ""
          );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
              "⚙ Node Actions",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "📎 Attach Files",
                    callback_data:
                      `attach_files_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "❌ Detach Files",
                    callback_data:
                      `detach_files_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "⬆⬇ Reorder Files",
                    callback_data:
                      `reorder_files_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "✏ Rename Node",
                    callback_data:
                      `rename_node_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "📝 Edit Description",
                    callback_data:
                      `description_node_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "🎴 Set Poster",
                    callback_data:
                      `set_poster_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "👁 View Poster",
                    callback_data:
                      `view_poster_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "🗑 Remove Poster",
                    callback_data:
                      `remove_poster_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "⬆⬇ Reorder Node",
                    callback_data:
                      `reorder_node_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "♻ Move To Trash",
                    callback_data:
                      `trash_node_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `lib_open_${publicId}`
                  },
                  {
                    text:
                      "❌ CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "reorder_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "reorder_node_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (!node) {

          await sendMessage(
            query.message.chat.id,
            "❌ Node not found."
          );

          return res.sendStatus(200);
        }

        const totalSiblings =
          await db.nodes.countDocuments({
            parent_id:
              node.parent_id,
            is_trashed: false
          });

        const buttons = [];

        if (
          node.position > 1
        ) {

          buttons.push([
            {
              text:
                "⬆ Move Up",
              callback_data:
                `moveup_node_${publicId}`
            }
          ]);
        }

        if (
          node.position <
          totalSiblings
        ) {

          buttons.push([
            {
              text:
                "⬇ Move Down",
              callback_data:
                `movedown_node_${publicId}`
            }
          ]);
        }

        buttons.push([
          {
            text:
              "⬅ Back",
            callback_data:
              `node_actions_${publicId}`
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⬆⬇ Reorder Node

Node :

${node.name}

Position : ${node.position} / ${totalSiblings}`,
            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "moveup_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "moveup_node_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (!node) {
          return res.sendStatus(200);
        }

        const previous =
          await db.nodes.find({
            parent_id:
              node.parent_id,
            is_trashed: false,
            position: {
              $lt: node.position
            }
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        if (previous.length) {

          await db.nodes.updateOne(
            {
              _id: node._id
            },
            {
              $set: {
                position:
                  previous[0].position
              }
            }
          );

          await db.nodes.updateOne(
            {
              _id:
                previous[0]._id
            },
            {
              $set: {
                position:
                  node.position
              }
            }
          );
        }

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          node.parent_id
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "movedown_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "movedown_node_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (!node) {
          return res.sendStatus(200);
        }

        const next =
          await db.nodes.find({
            parent_id:
              node.parent_id,
            is_trashed: false,
            position: {
              $gt: node.position
            }
          })
          .sort({
            position: 1
          })
          .limit(1)
          .toArray();

        if (next.length) {

          await db.nodes.updateOne(
            {
              _id: node._id
            },
            {
              $set: {
                position:
                  next[0].position
              }
            }
          );

          await db.nodes.updateOne(
            {
              _id:
                next[0]._id
            },
            {
              $set: {
                position:
                  node.position
              }
            }
          );
        }

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          node.parent_id
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "moveup_file_"
        )
      ) {

        const id =
          query.data.replace(
            "moveup_file_",
            ""
          );

        const file =
          await db.attachments.findOne({
            _id: new ObjectId(id)
          });

        if (!file) {
          return res.sendStatus(200);
        }

        const previous =
          await db.attachments.find({
            node_id:
              file.node_id,
            position: {
              $lt: file.position
            }
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        if (previous.length) {

          await db.attachments.updateOne(
            {
              _id: file._id
            },
            {
              $set: {
                position:
                  previous[0].position
              }
            }
          );

          await db.attachments.updateOne(
            {
              _id:
                previous[0]._id
            },
            {
              $set: {
                position:
                  file.position
              }
            }
          );
        }

        await normalizeAttachmentPositions(
          db,
          file.node_id
        );

        await normalizeAttachmentPositions(
          db,
          file.node_id
        );

        const updated =
          await db.attachments.findOne({
            _id: file._id
          });

        const totalFiles =
          await db.attachments.countDocuments({
            node_id:
              file.node_id
          });

        const node =
          await db.nodes.findOne({
            public_id:
              file.node_id
          });

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⬆⬇ Reorder Files

Node :

${node?.name || file.node_id}

File :

${updated.file_name}

Position : ${updated.position} / ${totalFiles}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬆ Move Up",
                    callback_data:
                      `moveup_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬇ Move Down",
                    callback_data:
                      `movedown_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `reorder_files_${file.node_id}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "movedown_file_"
        )
      ) {

        const id =
          query.data.replace(
            "movedown_file_",
            ""
          );

        const file =
          await db.attachments.findOne({
            _id: new ObjectId(id)
          });

        if (!file) {
          return res.sendStatus(200);
        }

        const next =
          await db.attachments.find({
            node_id:
              file.node_id,
            position: {
              $gt: file.position
            }
          })
          .sort({
            position: 1
          })
          .limit(1)
          .toArray();

        if (next.length) {

          await db.attachments.updateOne(
            {
              _id: file._id
            },
            {
              $set: {
                position:
                  next[0].position
              }
            }
          );

          await db.attachments.updateOne(
            {
              _id:
                next[0]._id
            },
            {
              $set: {
                position:
                  file.position
              }
            }
          );
        }

        const updated =
          await db.attachments.findOne({
            _id: file._id
          });

        const totalFiles =
          await db.attachments.countDocuments({
            node_id:
              file.node_id
          });

        const node =
          await db.nodes.findOne({
            public_id:
              file.node_id
          });

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⬆⬇ Reorder Files

Node :

${node?.name || file.node_id}

File :

${updated.file_name}

Position : ${updated.position} / ${totalFiles}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬆ Move Up",
                    callback_data:
                      `moveup_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬇ Move Down",
                    callback_data:
                      `movedown_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `reorder_files_${file.node_id}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "attach_files_"
        )
      ) {

        const publicId =
          query.data.replace(
            "attach_files_",
            ""
          );

        nodeFilesState[
          query.message.chat.id
        ] = {
          action: "attach_files",
          publicId,
          files: [],
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`📎 Attach Files

Send or Forward files.

You may send multiple files.

Press ✅ Done when finished.`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ Done",
                    callback_data:
                      `attach_done_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `lib_open_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "reorder_files_"
        )
      ) {

        const publicId =
          query.data.replace(
            "reorder_files_",
            ""
          );

        const files =
          await db.attachments.find({
            node_id: publicId
          }).sort({
            position: 1
          }).toArray();

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (!files.length) {

          await axios.post(
            `https://api.telegram.org/bot${TOKEN}/editMessageText`,
            {
              chat_id:
                query.message.chat.id,
              message_id:
                query.message.message_id,
              text:
`⬆⬇ Reorder Files

Node :

${node?.name || publicId}

No files attached.`,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "⬅ Back",
                      callback_data:
                        `node_actions_${publicId}`
                    }
                  ]
                ]
              }
            }
          );

          return res.sendStatus(200);
        }

        const buttons =
          files.map(
            file => [{
              text:
                file.file_name,
              callback_data:
                `reorder_file_${file._id}`
            }]
          );

        buttons.push([
          {
            text:
              "⬅ Back",
            callback_data:
              `node_actions_${publicId}`
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⬆⬇ Reorder Files

Node :

${node?.name || publicId}

Files :`,
            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "detach_files_"
        )
      ) {

        const publicId =
          query.data.replace(
            "detach_files_",
            ""
          );

        const files =
          await db.attachments.find({
            node_id: publicId
          }).sort({
            position: 1
          }).toArray();

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (!files.length) {

          await axios.post(
            `https://api.telegram.org/bot${TOKEN}/editMessageText`,
            {
              chat_id:
                query.message.chat.id,
              message_id:
                query.message.message_id,
              text:
`❌ Detach Files

Node :

${node?.name || publicId}

No files attached.`,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "⬅ Back",
                      callback_data:
                        `node_actions_${publicId}`
                    }
                  ]
                ]
              }
            }
          );

          return res.sendStatus(200);
        }

        const buttons =
          files.slice(0, 50).map(
            file => [{
              text:
                file.file_name,
              callback_data:
                `detach_select_${file._id}`
            }]
          );

        buttons.push([
          {
            text:
              "⬅ Back",
            callback_data:
              `node_actions_${publicId}`
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`❌ Detach Files

Node :

${node?.name || publicId}

Files :`,
            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "reorder_file_"
        )
      ) {

        const id =
          query.data.replace(
            "reorder_file_",
            ""
          );

        const file =
          await db.attachments.findOne({
            _id: new ObjectId(id)
          });

        if (!file) {

          await sendMessage(
            query.message.chat.id,
            "❌ Attachment not found."
          );

          return res.sendStatus(200);
        }

        const totalFiles =
          await db.attachments.countDocuments({
            node_id: file.node_id
          });

        const node =
          await db.nodes.findOne({
            public_id: file.node_id
          });

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⬆⬇ Reorder Files

Node :

${node?.name || file.node_id}

File :

${file.file_name}

Position : ${file.position} / ${totalFiles}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬆ Move Up",
                    callback_data:
                      `moveup_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬇ Move Down",
                    callback_data:
                      `movedown_file_${id}`
                  }
                ],
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `reorder_files_${file.node_id}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "detach_select_"
        )
      ) {

        const id =
          query.data.replace(
            "detach_select_",
            ""
          );

        const file =
          await db.attachments.findOne({
            _id: new ObjectId(id)
          });

        if (!file) {

          await sendMessage(
            query.message.chat.id,
            "❌ Attachment not found."
          );

          return res.sendStatus(200);
        }

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⚠ Detach File ?

${file.file_name}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ Confirm",
                    callback_data:
                      `detach_confirm_${id}`
                  }
                ],
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `detach_files_${file.node_id}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "detach_confirm_"
        )
      ) {

        const id =
          query.data.replace(
            "detach_confirm_",
            ""
          );

        const file =
          await db.attachments.findOne({
            _id: new ObjectId(id)
          });

        if (!file) {

          await sendMessage(
            query.message.chat.id,
            "❌ Attachment not found."
          );

          return res.sendStatus(200);
        }

        await db.attachments.deleteOne({
          _id: new ObjectId(id)
        });

        await normalizeAttachmentPositions(
          db,
          file.node_id
        );

        const node =
          await db.nodes.findOne({
            public_id:
              file.node_id
          });

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`✅ File Detached

Node :

${node?.name || file.node_id}

Detached :

${file.file_name}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `detach_files_${file.node_id}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "attach_done_"
        )
      ) {

        const publicId =
          query.data.replace(
            "attach_done_",
            ""
          );

        const state =
          nodeFilesState[
            query.message.chat.id
          ];

        if (
          !state ||
          !state.files.length
        ) {

          await sendMessage(
            query.message.chat.id,
            "❌ No files queued."
          );

          return res.sendStatus(200);
        }

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        const preview =
          state.files
            .slice(0, 20)
            .map(
              x => `• ${x.file_name}`
            )
            .join("\n");

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`📎 Attach Files

Node :

${node?.name || publicId}

Files :

${preview}

Total Files : ${state.files.length}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "✅ Confirm",
                    callback_data:
                      `attach_confirm_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `attach_cancel_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "attach_cancel_"
        )
      ) {

        const publicId =
          query.data.replace(
            "attach_cancel_",
            ""
          );

        delete nodeFilesState[
          query.message.chat.id
        ];

        await renderLibraryNode(
          db,
          query.message.chat.id,
          query.message.message_id,
          publicId
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "attach_confirm_"
        )
      ) {

        const publicId =
          query.data.replace(
            "attach_confirm_",
            ""
          );

        const state =
          nodeFilesState[
            query.message.chat.id
          ];

        if (
          !state ||
          !state.files.length
        ) {

          await sendMessage(
            query.message.chat.id,
            "❌ No files queued."
          );

          return res.sendStatus(200);
        }

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        const lastFile =
          await db.attachments.find({
            node_id: publicId
          })
          .sort({
            position: -1
          })
          .limit(1)
          .toArray();

        let position =
          lastFile.length
            ? lastFile[0].position + 1
            : 1;

        for (const file of state.files) {

          await db.attachments.insertOne({
            node_id: publicId,
            file_id: file.file_id,
            file_name:
              file.file_name,
            media_type:
              file.media_type,
            position,
            attached_at:
              new Date()
          });

          position++;
        }

        await normalizeAttachmentPositions(
          db,
          publicId
        );

        const total =
          state.files.length;

        delete nodeFilesState[
          query.message.chat.id
        ];

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`✅ Files Attached

Node :

${node?.name || publicId}

Attached Files : ${total}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      `lib_open_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "trash_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "trash_node_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId,
            is_trashed: false
          });

        if (!node) {

          await sendMessage(
            query.message.chat.id,
            "❌ Node not found."
          );

          return res.sendStatus(200);
        }

        const descendants =
          await getNodeDescendants(
            db,
            publicId
          );

        const preview =
          descendants
            .slice(0, 15)
            .map(
              x => `• ${x.name}`
            )
            .join("\n");

        const extra =
          descendants.length > 15
            ? "\n• ..."
            : "";

        const affectedCount =
          descendants.length + 1;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`⚠  𝗠𝗼𝘃𝗲 𝗡𝗼𝗱𝗲 𝘁𝗼 𝗧𝗿𝗮𝘀𝗵 ?

${node.name}

${descendants.length
  ? `𝐂𝐡𝐢𝐥𝐝𝐫𝐞𝐧 𝐍𝐨𝐝𝐞𝐬 𝐀𝐟𝐟𝐞𝐜𝐭𝐞𝐝 :

${preview}${extra}

`
  : ""}𝚃𝚘𝚝𝚊𝚕 𝙰𝚏𝚏𝚎𝚌𝚝𝚎𝚍 𝙽𝚘𝚍𝚎𝚜 : ${affectedCount}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "♻ Confirm",
                    callback_data:
                      `confirm_trash_${publicId}`
                  }
                ],
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `node_actions_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "confirm_trash_"
        )
      ) {

        const publicId =
          query.data.replace(
            "confirm_trash_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId,
            is_trashed: false
          });

        if (!node) {

          await sendMessage(
            query.message.chat.id,
            "❌ Node not found."
          );

          return res.sendStatus(200);
        }

        const descendants =
          await getNodeDescendants(
            db,
            publicId
          );

        const ids = [
          publicId,
          ...descendants.map(
            x => x.public_id
          )
        ];

        await db.nodes.updateMany(
          {
            public_id: {
              $in: ids
            }
          },
          {
            $set: {
              is_trashed: true,
              updated_at:
                new Date()
            }
          }
        );

        const affectedCount =
          ids.length;

        const backTarget =
          node.parent_id === "ROOT"
            ? "bankai_library"
            : `lib_open_${node.parent_id}`;

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`♻  𝗡𝗼𝗱𝗲𝘀 𝗠𝗼𝘃𝗲𝗱 𝘁𝗼 𝗧𝗿𝗮𝘀𝗵

Root Node :

${node.name}

Affected Nodes : ${affectedCount}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬅ Back",
                    callback_data:
                      backTarget
                  },
                  {
                    text:
                      "❌ CLOSE",
                    callback_data:
                      "close_search"
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "view_poster_"
        )
      ) {

        const publicId =
          query.data.replace(
            "view_poster_",
            ""
          );

        const node =
          await db.nodes.findOne({
            public_id: publicId
          });

        if (
          !node ||
          !node.poster_file_id
        ) {

          await sendMessage(
            query.message.chat.id,
            "❌ No poster set."
          );

          return res.sendStatus(200);
        }

        await sendNodePoster(
          query.message.chat.id,
          node,
          `🎴 ${node.name}`
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "remove_poster_"
        )
      ) {

        const publicId =
          query.data.replace(
            "remove_poster_",
            ""
          );

        await db.nodes.updateOne(
          {
            public_id: publicId
          },
          {
            $set: {
              poster_file_id: null,
              poster_media_type: null,
              updated_at: new Date()
            }
          }
        );

        await sendMessage(
          query.message.chat.id,
          "✅ Poster Removed"
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "set_poster_"
        )
      ) {

        const publicId =
          query.data.replace(
            "set_poster_",
            ""
          );

        nodePosterState[
          query.message.chat.id
        ] = {
          publicId,
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
`🎴 Set Poster

Send:

• Photo
• Video
• GIF

Poster will replace existing one.`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `node_actions_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "description_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "description_node_",
            ""
          );

        nodeActionState[
          query.message.chat.id
        ] = {
          action:
            "edit_description",
          publicId,
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
              "📝 Send new description",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `node_actions_${publicId}`
                  }
                ]
              ]
            }
          }
        );

        return res.sendStatus(200);
      }



if (
        query.data.startsWith(
          "rename_node_"
        )
      ) {

        const publicId =
          query.data.replace(
            "rename_node_",
            ""
          );

        nodeActionState[
          query.message.chat.id
        ] = {
          action: "rename_node",
          publicId,
          createdAt: Date.now()
        };

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id,
            text:
              "✏ Send new node name",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "❌ Cancel",
                    callback_data:
                      `node_actions_${publicId}`
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

        clearAdminStates(
          query.message.chat.id
        );

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            text: "⚙️ Admin Panel",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: " ㅤ⛩️  BANKAIㅤ❖ㅤLIBRARYㅤ ",
                    callback_data: "bankai_library"
                  }
                ],

                [
                  {
                    text: " 🗃️ Upload ",
                    callback_data: "admin_upload"
                  },
                  {
                    text: "I",
                    callback_data: "noop"
                  }
                ],

                [
                  {
                    text: " 📢 Broadcast ",
                    callback_data: "admin_broadcast"
                  },
                  {
                    text: "II",
                    callback_data: "noop"
                  }
                ],

                [
                  {
                    text: " 📊 User Stats ",
                    callback_data: "user_stats"
                  },
                  {
                    text: "III",
                    callback_data: "noop"
                  }
                ],

                [
                  {
                    text: " 🔨 Ban User ",
                    callback_data: "ban_user"
                  },
                  {
                    text: "IV",
                    callback_data: "noop"
                  }
                ],

                [
                  {
                    text: " 🚫 Banned Users ",
                    callback_data: "banned_users"
                  },
                  {
                    text: " 🔎 Search History ",
                    callback_data: "search_history"
                  }
                ],

                [
                  {
                    text:
                      " 🕘 View Upload/Delete History ",
                    callback_data: "upload_history"
                  }
                ],

                [
                  {
                    text: " 🔒 Close ",
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


      if (query.data === "page_info") {

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
            text: `🔎 ${keyword}ㅤㅤㅤㅤㅤㅤㅤㅤㅤ`,
            reply_markup: {
              inline_keyboard: [
                ...buttons,
                [
                  {
                    text: " 🔒 Close ",
                    callback_data: "close_search"
                  }
                ]
              ]
            }
          }
        );
      }


      if (
        query.data.startsWith(
          "allsearch_"
        )
      ) {

        const parts =
          query.data.split("_");

        const keyword =
          parts[1];

        const page =
          Number(parts[2]);

        const limit = 5;

        const skip =
          (page - 1) * limit;

        const totalResults =
          await db.history.countDocuments({
            file_name: {
              $regex: keyword,
              $options: "i"
            }
          });

        const totalPages =
          Math.max(
            1,
            Math.ceil(
              totalResults / limit
            )
          );

        const results =
          await db.history.find({
            file_name: {
              $regex: keyword,
              $options: "i"
            }
          })
          .sort({
            timestamp: -1
          })
          .skip(skip)
          .limit(limit)
          .toArray();

        let resultText =
          `🔎 History Search: ${keyword}ㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ`;

        const buttons = [];

        results.forEach((item) => {

          const icon =
            item.action === "delete"
              ? "🗑️"
              : "📤";

          const lower =
            (item.file_name || "")
              .toLowerCase();

          let mediaEmoji = "📂";

          if (
            [
              ".mp3",
              ".m4a",
              ".flac",
              ".wav",
              ".aac",
              ".ogg",
              ".opus",
              ".alac",
              ".wma",
              ".aiff"
            ].some(ext =>
              lower.endsWith(ext)
            )
          ) {

            mediaEmoji = "🎵";
          }

          else if (
            item.media_type === "voice"
          ) {

            mediaEmoji = "🔊";
          }

          else if (
            [
              ".mp4",
              ".mkv",
              ".avi",
              ".mov",
              ".webm",
              ".flv",
              ".wmv",
              ".m4v",
              ".3gp",
              ".ts"
            ].some(ext =>
              lower.endsWith(ext)
            )
          ) {

            mediaEmoji = "🎬";
          }

          else if (
            item.media_type === "sticker"
          ) {

            mediaEmoji = "🎭";
          }

          else if (
            lower.endsWith(".gif")
            ||
            item.media_type === "animation"
          ) {

            mediaEmoji = "👾";
          }

          const shortAction =
            item.action === "delete"
              ? "DLT"
              : "UP";

          buttons.push([
            {
              text:
`${icon} ${shortAction} ${mediaEmoji} • ${item.file_name.slice(0, 55)}`,

              callback_data:
                `historyfile_${item._id}`
            }
          ]);
        });

        buttons.push([
          {
            text:
              page > 1
                ? "❮"
                : "•",

            callback_data:
              page > 1
                ? `allsearch_${keyword}_${page - 1}`
                : "noop"
          },

          {
            text:
              `${page}/${totalPages}`,

            callback_data:
              "noop"
          },

          {
            text:
              page < totalPages
                ? "❯"
                : "•",

            callback_data:
              page < totalPages
                ? `allsearch_${keyword}_${page + 1}`
                : "noop"
          }
        ]);

        buttons.push([
          {
            text:
              " 🔒 Close ",

            callback_data:
              "close_search"
          }
        ]);

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/editMessageText`,
          {
            chat_id:
              query.message.chat.id,

            message_id:
              query.message.message_id,

            text:
              resultText,

            reply_markup: {
              inline_keyboard:
                buttons
            }
          }
        );

        return res.sendStatus(200);
      }


      if (
        query.data.startsWith(
          "historyfile_"
        )
      ) {

        const historyId =
          query.data.replace(
            "historyfile_",
            ""
          );

        const file =
          await db.history.findOne({
            _id: new ObjectId(historyId)
          });

        if (
          !file
          ||
          !file.file_id
        ) {

          await axios.post(
            `https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`,
            {
              callback_query_id:
                query.id,

              text:
                "Old history entry cannot be recovered.",

              show_alert: true
            }
          );

          return res.sendStatus(200);
        }

        let method =
          "sendDocument";

        let payload = {
          chat_id:
            query.message.chat.id
        };

        if (
          file.media_type ===
          "photo"
        ) {

          method =
            "sendPhoto";

          payload.photo =
            file.file_id;
        }

        else if (
          file.media_type ===
          "video"
        ) {

          method =
            "sendVideo";

          payload.video =
            file.file_id;
        }

        else if (
          file.media_type ===
          "audio"
        ) {

          method =
            "sendAudio";

          payload.audio =
            file.file_id;
        }

        else if (
          file.media_type ===
          "animation"
        ) {

          method =
            "sendAnimation";

          payload.animation =
            file.file_id;
        }

        else if (
          file.media_type ===
          "voice"
        ) {

          method =
            "sendVoice";

          payload.voice =
            file.file_id;
        }

        else if (
          file.media_type ===
          "sticker"
        ) {

          method =
            "sendSticker";

          payload.sticker =
            file.file_id;
        }

        else {

          payload.document =
            file.file_id;
        }

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/${method}`,
          payload
        );

        return res.sendStatus(200);
      }


      if (query.data.startsWith("getfile_")) {

        const fileDbId = query.data.replace("getfile_", "");

        const file = await db.files.findOne({
          _id: new ObjectId(fileDbId)
        });

        if (!file) {
          return res.sendStatus(200);
        }

        let method = "sendDocument";
        let payload = {
          chat_id: query.message.chat.id
        };

        if (file.media_type === "photo") {
          method = "sendPhoto";
          payload.photo = file.file_id;
        }

        else if (file.media_type === "video") {
          method = "sendVideo";
          payload.video = file.file_id;
        }

        else if (file.media_type === "audio") {
          method = "sendAudio";
          payload.audio = file.file_id;
        }

        else if (file.media_type === "animation") {
          method = "sendAnimation";
          payload.animation = file.file_id;
        }

        else if (file.media_type === "voice") {
          method = "sendVoice";
          payload.voice = file.file_id;
        }

        else if (file.media_type === "sticker") {
          method = "sendSticker";
          payload.sticker = file.file_id;
          delete payload.caption;
        }

        else {

          payload.document = file.file_id;

          const lower =
            (file.file_name || "").toLowerCase();

          const captionExtensions = [
            ".txt",
            ".zip",
            ".7z",
            ".rar",
            ".tar",
            ".db",
            ".php"
          ];

          const shouldCaption =
            captionExtensions.some(ext =>
              lower.endsWith(ext)
            );

          if (shouldCaption) {
            payload.caption = file.file_name;
          }
        }

        await axios.post(
          `https://api.telegram.org/bot${TOKEN}/${method}`,
          payload
        );

        return res.sendStatus(200);
      }
    }

    res.sendStatus(200);

  } catch (err) {

    const desc =
      err?.response?.data?.description || "";

    if (
      desc.includes(
        "message is not modified"
      ) ||
      desc.includes(
        "message to edit not found"
      ) ||
      desc.includes(
        "message to delete not found"
      )
    ) {

      return res.sendStatus(200);
    }

    console.log(
      err.response?.data ||
      err.message ||
      err
    );

    res.sendStatus(500);
  }
});


async function initializeDatabase() {
  const db = await getDB();

  await ensureRootNode(db);

  await db.nodes.createIndex(
    { public_id: 1 },
    { unique: true }
  );

  await db.nodes.createIndex({
    parent_id: 1
  });

  await db.nodes.createIndex({
    name: 1
  });

  await db.nodes.createIndex({
    is_trashed: 1
  });

  await db.attachments.createIndex({
    node_id: 1
  });

  await db.share_links.createIndex(
    { token: 1 },
    { unique: true }
  );

  await db.users.createIndex({
    chat_id: 1
  });
}

initializeDatabase()
  .then(() => {
    console.log("DB Ready");
  })
  .catch(console.error);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

