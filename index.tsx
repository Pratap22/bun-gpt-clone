import mongoose from "mongoose";
import { ChatHistory } from "./schema";
import { makeGPTCall } from "./gpt";

const server = Bun.serve({
  hostname: "localhost",
  port: 3000,
  fetch: fetchHandler,
});

console.log(
  `Chat GPT Clone using Bun is running on ${server.hostname}:${server.port}`
);

await mongoose.connect(process.env.MONGO_URI!);

type ChatMessage = { role: string; content: string };

let currentChatId: string | null = null;
let currentChatMessages: ChatMessage[] = [];
let chatIds: string[] = [];

const dbChats = await ChatHistory.find();

for (const chat of dbChats) {
  chatIds.push(String(chat._id));
}

async function fetchHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "" || url.pathname === "/") {
    return new Response(Bun.file("index.html"));
  }

  if (url.pathname === "/new-chat" && request.method === "POST") {
    const formdata = (await request.formData()) as any;
    const message = formdata.get("message");
    const role = "user";

    if (currentChatId) {
      const currentChat = await ChatHistory.findOne({
        _id: new mongoose.mongo.ObjectId(currentChatId!),
      });
      if (currentChat) {
        currentChatMessages = currentChat.messages || [];
        currentChatMessages.push({ role: role, content: message });

        await ChatHistory.updateOne(
          { _id: new mongoose.mongo.ObjectId(currentChatId!) },
          { $set: { messages: currentChatMessages } }
        );
        return new Response(
          `<div 
            hx-trigger="load" 
            hx-get="/get-gpt-response" 
            hx-target=".messages" 
            hx-indicator="#indicator" 
            hx-swap="beforeend">
                ${message}
            </div>`,
          { status: 200 }
        );
      }
    } else {
      const newChat = {
        messages: [{ role: role, content: message }],
      };
      const createdChat = await ChatHistory.create(newChat);
      currentChatId = String(createdChat._id);
      currentChatMessages.push({ role: role, content: message });

      return new Response(`<div 
                            hx-trigger="load" 
                            hx-get="/get-gpt-response" 
                            hx-target=".messages" 
                            hx-indicator="#indicator" 
                            hx-swap="beforeend">
                                ${message}
                            </div>`);
    }
  }

  if (url.pathname === "/get-gpt-response" && request.method === "GET") {
    const gptResponse = await makeGPTCall(currentChatMessages);
    currentChatMessages.push({ role: "assistant", content: gptResponse || "" });
    await ChatHistory.updateOne(
      { _id: new mongoose.mongo.ObjectId(currentChatId!) },
      {
        $set: {
          messages: currentChatMessages,
        },
      }
    );
    let formattedHtml = "";
    if (chatIds.includes(currentChatId!)) {
      formattedHtml = `<div">
        ${gptResponse}
    </div>`;
    } else {
      formattedHtml = `<div 
                        hx-trigger="load" 
                        hx-get="/load-history-button" 
                        hx-target=".chat-history" 
                        hx-swap="afterbegin"">
                        ${gptResponse}
                    </div>`;
    }

    return new Response(formattedHtml, { status: 200 });
  }

  if (url.pathname === "/load-history-button" && request.method === "GET") {
    let messages = currentChatMessages;
    messages.push({
      role: "user",
      content:
        "Summarize this conversation in maximum of 3 word sentence generally describing what the conversation is about",
    });

    const summary = await makeGPTCall(messages);
    await ChatHistory.updateOne(
      { _id: new mongoose.mongo.ObjectId(currentChatId!) },
      {
        $set: {
          summary: summary,
        },
      }
    );
    chatIds.push(currentChatId!);
    return new Response(
      `<button 
      hx-get="/load-chat" 
      hx-trigger="click" 
      hx-target=".messages" 
      hx-swap="innerHTML" 
      data-chat-id="${currentChatId}"
      hx-on='htmx:configRequest: event.detail.parameters.chatId = this.getAttribute("data-chat-id")'
      title="${summary}">
      ${summary}
  </button>`,
      { status: 200 }
    );
  }

  if (
    url.pathname === "/load-history-on-page-load" &&
    request.method === "GET"
  ) {
    let buttons = [];
    const chats = await ChatHistory.find();
    for (const chat of chats) {
      const chatId = String(chat._id);
      const buttonHtml = ` <button
      class="summary"
      hx-get="/load-chat" 
      data-chat-id="${chatId}" 
      hx-trigger="click" 
      hx-target=".messages" 
      hx-swap="innerHTML"
      hx-on='htmx:configRequest: event.detail.parameters.chatId = this.getAttribute("data-chat-id")' 
      title="${chat.summary}">
        ${chat.summary}
    </button>`;
      buttons.push(buttonHtml);
    }

    return new Response(buttons.join(""), { status: 200 });
  }

  if (url.pathname === "/load-chat" && request.method === "GET") {
    const chatId = url.searchParams.get("chatId");
    const chat = await ChatHistory.findOne({
      _id: new mongoose.mongo.ObjectId(chatId!),
    });

    currentChatId = chatId;

    if (chat && chat.messages && chat.messages.length > 0) {
      const formattedHtml = chat.messages
        .map((message) => `<div>${message.content}</div>`)
        .join("");

      return new Response(formattedHtml, { status: 200 });
    } else {
      return new Response("<div>No Chat found with the provided id</div>", {
        status: 200,
      });
    }
  }

  if (url.pathname === "/clear-chat" && request.method === "GET") {
    currentChatId = null;
    currentChatMessages = [];
    return new Response(`<div id="messages" class="messages"></div>`);
  }

  return new Response("Not Found", { status: 404 });
}
