import { AugmentedCanvasSettings } from "./settings/AugmentedCanvasSettings";

let _settings: AugmentedCanvasSettings | null = null;

export const initLogDebug = (settings2: AugmentedCanvasSettings) => {
	// console.log({ settings2 });
	_settings = settings2;
};

// @ts-expect-error - 允许任意参数用于调试日志
export const logDebug = (...params) => {
	// console.log({ settings })
	_settings?.debug && console.log(...params);
};
