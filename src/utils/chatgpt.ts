import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { logDebug } from "src/logDebug";

export type Message = {
	role: string;
	content: string;
};

export type StreamCallback = (chunk: string | null, error?: Error) => void;

export const streamResponse = async (
	apiKey: string,
	messages: ChatCompletionMessageParam[],
	{
		max_tokens,
		model,
		temperature,
	}: {
		max_tokens?: number;
		model?: string;
		temperature?: number;
	} = {},
	cb: StreamCallback
) => {
	logDebug("Calling AI :", {
		messages,
		model,
		max_tokens,
		temperature,
		isJSON: false,
	});
	const openai = new OpenAI({
		apiKey: apiKey,
		baseURL: "https://api.deepseek.com/v1",
		dangerouslyAllowBrowser: true,
	});

	try {
		const stream = await openai.chat.completions.create({
			model: model || "deepseek-chat",
			messages,
			stream: true,
			max_tokens,
			temperature,
		});
		for await (const chunk of stream) {
			logDebug("AI chunk", { chunk });
			cb(chunk.choices[0]?.delta?.content || "");
		}
		// Stream completed successfully
		cb(null);
	} catch (error: any) {
		logDebug("Stream error:", error);
		const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
		// Pass error to callback instead of throwing
		cb(null, errorObj);
	}
};

export const getResponse = async (
	apiKey: string,
	// prompt: string,
	messages: ChatCompletionMessageParam[],
	{
		model,
		max_tokens,
		temperature,
		isJSON,
	}: {
		model?: string;
		max_tokens?: number;
		temperature?: number;
		isJSON?: boolean;
	} = {}
) => {
	logDebug("Calling AI :", {
		messages,
		model,
		max_tokens,
		temperature,
		isJSON,
	});

	const openai = new OpenAI({
		apiKey: apiKey,
		baseURL: "https://api.deepseek.com/v1",
		dangerouslyAllowBrowser: true,
	});

	// const totalTokens =
	// 	openaiMessages.reduce(
	// 		(total, message) => total + (message.content?.length || 0),
	// 		0
	// 	) * 2;
	// console.log({ totalTokens });

	const completion = await openai.chat.completions.create({
		// model: "gpt-3.5-turbo",
		model: model || "deepseek-chat",
		messages,
		max_tokens,
		temperature,
		response_format: { type: isJSON ? "json_object" : "text" },
	});

	logDebug("AI response", { completion });
	return isJSON
		? JSON.parse(completion.choices[0].message!.content!)
		: completion.choices[0].message!.content!;
};

let count = 0;
export const createImage = async (
	apiKey: string,
	prompt: string,
	{
		isVertical = false,
		model,
	}: {
		isVertical?: boolean;
		model?: string;
	}
) => {
	// Note: DeepSeek does not support image generation
	// This function is kept for compatibility but will throw an error
	throw new Error("DeepSeek API does not support image generation. Please use OpenAI API for image generation features.");
	
	// logDebug("Calling AI :", {
	// 	prompt,
	// 	model,
	// });
	// const openai = new OpenAI({
	// 	apiKey: apiKey,
	// 	baseURL: "https://api.deepseek.com",
	// 	dangerouslyAllowBrowser: true,
	// });

	// count++;
	// // console.log({ createImage: { prompt, count } });
	// const response = await openai.images.generate({
	// 	model: model || "dall-e-3",
	// 	prompt,
	// 	n: 1,
	// 	size: isVertical ? "1024x1792" : "1792x1024",
	// 	response_format: "b64_json",
	// });
	// logDebug("AI response", { response });
	// // console.log({ responseImg: response });
	// return response.data[0].b64_json!;
};
