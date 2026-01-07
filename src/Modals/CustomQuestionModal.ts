import { Modal, App } from "obsidian";

export class CustomQuestionModal extends Modal {
	onSubmit: (input: string) => void;
	private placeholder: string = "在此输入您的问题";
	private textareaEl?: HTMLTextAreaElement;

	constructor(app: App, onSubmit: (input: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Set custom placeholder text for the input
	 */
	setPlaceholder(placeholder: string): void {
		this.placeholder = placeholder;
		if (this.textareaEl) {
			this.textareaEl.placeholder = placeholder;
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.className = "augmented-canvas-modal-container";

		const textareaEl = contentEl.createEl("textarea");
		this.textareaEl = textareaEl;
		textareaEl.className = "augmented-canvas-modal-textarea";
		textareaEl.placeholder = this.placeholder;

		// Add keydown event listener to the textarea
		textareaEl.addEventListener("keydown", (event) => {
			// Check if Ctrl + Enter is pressed
			if (event.ctrlKey && event.key === "Enter") {
				// Prevent default action to avoid any unwanted behavior
				event.preventDefault();
				console.log("Ctrl+Enter pressed, submitting question:", textareaEl.value);
				// Call the onSubmit function and close the modal
				this.onSubmit(textareaEl.value);
				this.close();
			}
		});

		// Create and append a submit button
		const submitBtn = contentEl.createEl("button", { text: "提问 AI" });
		submitBtn.addEventListener("click", (e) => {
			console.log("Ask AI button clicked, question:", textareaEl.value);
			e.preventDefault();
			e.stopPropagation();
			this.onSubmit(textareaEl.value);
			this.close();
		});

		console.log("CustomQuestionModal opened, button attached");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
