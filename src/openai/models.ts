export const CHAT_MODELS = {
	DEEPSEEK_CHAT: {
		name: "deepseek-chat",
		tokenLimit: 32000,
	},
	DEEPSEEK_CODER: {
		name: "deepseek-coder",
		tokenLimit: 16000,
	},
};

export function chatModelByName(name: string) {
	return Object.values(CHAT_MODELS).find((model) => model.name === name) || CHAT_MODELS.DEEPSEEK_CHAT;
}
