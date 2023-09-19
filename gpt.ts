import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function makeGPTCall(messages: any[]) {
  const completion = await openai.chat.completions.create({
    messages,
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0].message.content;
}

export { makeGPTCall };
