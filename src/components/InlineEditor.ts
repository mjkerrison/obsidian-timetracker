export interface InlineEditorCallbacks {
	onConfirm: (text: string) => void;
	onCancel: () => void;
}

export function createInlineEditor(
	container: HTMLElement,
	initialText: string,
	callbacks: InlineEditorCallbacks,
	position: { gridColumn: string; gridRow: string }
): HTMLElement {
	const editor = document.createElement("div");
	editor.className = "tt-inline-editor";
	editor.style.gridColumn = position.gridColumn;
	editor.style.gridRow = position.gridRow;

	const input = editor.createEl("input", {
		type: "text",
		cls: "tt-inline-editor-input",
		value: initialText,
		placeholder: "Enter description...",
	});

	const buttons = editor.createDiv({ cls: "tt-inline-editor-buttons" });

	const confirmBtn = buttons.createEl("button", {
		cls: "tt-inline-editor-btn tt-inline-editor-confirm",
		text: "✓",
	});

	const cancelBtn = buttons.createEl("button", {
		cls: "tt-inline-editor-btn tt-inline-editor-cancel",
		text: "✕",
	});

	// Event handlers
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			callbacks.onConfirm(input.value);
		} else if (e.key === "Escape") {
			e.preventDefault();
			callbacks.onCancel();
		}
	});

	confirmBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		callbacks.onConfirm(input.value);
	});

	cancelBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		callbacks.onCancel();
	});

	container.appendChild(editor);

	// Focus input after adding to DOM
	setTimeout(() => input.focus(), 0);

	return editor;
}

export function removeInlineEditor(editor: HTMLElement | null) {
	if (editor && editor.parentElement) {
		editor.parentElement.removeChild(editor);
	}
}
