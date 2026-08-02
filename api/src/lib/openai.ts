import OpenAI from "openai";

let openAIClient: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to create the OpenAI client.");
  }

  openAIClient ??= new OpenAI({ apiKey });

  return openAIClient;
}
