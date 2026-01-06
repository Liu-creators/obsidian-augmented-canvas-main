/**
 * Mock for the 'obsidian' module
 * This allows tests to run without the actual Obsidian API
 */

export const App = jest.fn();
export const Canvas = jest.fn();
export const CanvasCoords = jest.fn();
export const ItemView = jest.fn();
export const Menu = jest.fn();
export const MenuItem = jest.fn();
export const TFile = jest.fn();
export const CanvasGroupNode = jest.fn();
export const Plugin = jest.fn();
export const PluginSettingTab = jest.fn();
export const Setting = jest.fn();
export const Notice = jest.fn();
export const Modal = jest.fn();
export const MarkdownRenderer = jest.fn();
export const Component = jest.fn();
export const requestUrl = jest.fn();
