import * as mongoose from "mongoose";

const chatHistorySchema = new mongoose.Schema({
  summary: { type: String, required: false },
  messages: { type: [], required: false },
});

export type ChatHistory = mongoose.InferSchemaType<typeof chatHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);
