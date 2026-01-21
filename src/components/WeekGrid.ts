import { TimeEntry } from "../types";
import { TimeTrackerStorage } from "../storage";
import {
	formatDate,
	getWeekDates,
	slotToTime,
	timeToSlot,
	getDayName,
	getMonthName,
	parseTimeToMinutes,
	minutesToTime,
} from "../utils/time";
import { createTimeEntryElement, TimeEntryCallbacks } from "./TimeEntry";
import { createInlineEditor, removeInlineEditor } from "./InlineEditor";

export interface WeekGridOptions {
	weekStartDay: 0 | 1;
	currentDate: Date;
	storage: TimeTrackerStorage;
	onDateChange?: (date: Date) => void;
}

interface PaintState {
	isPainting: boolean;
	dayIndex: number;
	startSlot: number;
	endSlot: number;
}

interface DragState {
	isDragging: boolean;
	entry: TimeEntry | null;
	mode: "move" | "resize-top" | "resize-bottom";
	initialMouseY: number;
	initialStartSlot: number;
	initialEndSlot: number;
	dayIndex: number;
}

export class WeekGrid {
	private container: HTMLElement;
	private gridEl: HTMLElement | null = null;
	private options: WeekGridOptions;
	private weekDates: Date[] = [];
	private entries: Map<string, TimeEntry[]> = new Map();

	private paintState: PaintState = {
		isPainting: false,
		dayIndex: -1,
		startSlot: -1,
		endSlot: -1,
	};

	private dragState: DragState = {
		isDragging: false,
		entry: null,
		mode: "move",
		initialMouseY: 0,
		initialStartSlot: 0,
		initialEndSlot: 0,
		dayIndex: 0,
	};

	private paintPreviewEl: HTMLElement | null = null;
	private inlineEditorEl: HTMLElement | null = null;
	private boundMouseMove: (e: MouseEvent) => void;
	private boundMouseUp: (e: MouseEvent) => void;

	constructor(container: HTMLElement, options: WeekGridOptions) {
		this.container = container;
		this.options = options;
		this.weekDates = getWeekDates(options.currentDate, options.weekStartDay);

		this.boundMouseMove = this.handleMouseMove.bind(this);
		this.boundMouseUp = this.handleMouseUp.bind(this);

		this.render();
	}

	async render() {
		// Preserve scroll position
		const scrollTop = this.container.scrollTop;
		const scrollLeft = this.container.scrollLeft;

		this.container.empty();
		await this.loadEntries();
		this.renderGrid();
		this.renderEntries();

		// Restore scroll position
		this.container.scrollTop = scrollTop;
		this.container.scrollLeft = scrollLeft;
	}

	private async loadEntries() {
		await this.options.storage.loadEntries();
		this.entries.clear();

		for (const date of this.weekDates) {
			const dateStr = formatDate(date);
			const dayEntries = this.options.storage.getEntriesForDate(dateStr);
			this.entries.set(dateStr, dayEntries);
		}
	}

	private renderGrid() {
		this.gridEl = this.container.createDiv({ cls: "tt-week-grid" });

		// Header row
		this.renderHeader();

		// Time slots
		this.renderTimeSlots();

		// Day columns with slot cells
		this.renderDayColumns();
	}

	private renderHeader() {
		if (!this.gridEl) return;

		// Empty corner cell
		const corner = this.gridEl.createDiv({ cls: "tt-grid-corner" });
		corner.style.gridColumn = "1";
		corner.style.gridRow = "1";

		// Day headers
		this.weekDates.forEach((date, index) => {
			const header = this.gridEl!.createDiv({ cls: "tt-day-header" });
			header.style.gridColumn = String(index + 2);
			header.style.gridRow = "1";

			const dayName = header.createDiv({ cls: "tt-day-name" });
			dayName.textContent = getDayName(date);

			const dayDate = header.createDiv({ cls: "tt-day-date" });
			dayDate.textContent = `${getMonthName(date)} ${date.getDate()}`;

			// Highlight today
			if (formatDate(date) === formatDate(new Date())) {
				header.classList.add("tt-day-header-today");
			}
		});
	}

	private renderTimeSlots() {
		if (!this.gridEl) return;

		// 96 slots for 24 hours (15-min each)
		for (let slot = 0; slot < 96; slot++) {
			const timeLabel = this.gridEl.createDiv({ cls: "tt-time-label" });
			timeLabel.style.gridColumn = "1";
			timeLabel.style.gridRow = String(slot + 2);

			// Only show label for hour marks
			if (slot % 4 === 0) {
				timeLabel.textContent = slotToTime(slot);
				timeLabel.classList.add("tt-time-label-hour");
			}
		}
	}

	private renderDayColumns() {
		if (!this.gridEl) return;

		for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
			for (let slot = 0; slot < 96; slot++) {
				const cell = this.gridEl.createDiv({ cls: "tt-grid-cell" });
				cell.style.gridColumn = String(dayIndex + 2);
				cell.style.gridRow = String(slot + 2);
				cell.dataset.dayIndex = String(dayIndex);
				cell.dataset.slot = String(slot);

				// Hour line
				if (slot % 4 === 0) {
					cell.classList.add("tt-grid-cell-hour");
				}

				// Click handlers for painting
				cell.addEventListener("mousedown", (e) => this.handleCellMouseDown(e, dayIndex, slot));
			}
		}
	}

	private renderEntries() {
		if (!this.gridEl) return;

		const callbacks: TimeEntryCallbacks = {
			onEdit: (entry) => this.handleEditEntry(entry),
			onResizeStart: (entry, edge, e) => this.handleResizeStart(entry, edge, e),
			onDragStart: (entry, e) => this.handleDragStart(entry, e),
		};

		this.weekDates.forEach((date, dayIndex) => {
			const dateStr = formatDate(date);
			const dayEntries = this.entries.get(dateStr) || [];

			dayEntries.forEach((entry) => {
				const entryEl = createTimeEntryElement(entry, callbacks, dayIndex);
				this.gridEl!.appendChild(entryEl);
			});
		});
	}

	private handleCellMouseDown(e: MouseEvent, dayIndex: number, slot: number) {
		if (e.button !== 0) return; // Only left click
		if (this.dragState.isDragging) return;

		e.preventDefault();

		this.paintState = {
			isPainting: true,
			dayIndex,
			startSlot: slot,
			endSlot: slot,
		};

		this.showPaintPreview();

		document.addEventListener("mousemove", this.boundMouseMove);
		document.addEventListener("mouseup", this.boundMouseUp);
	}

	private handleMouseMove(e: MouseEvent) {
		if (this.paintState.isPainting) {
			this.handlePaintMove(e);
		} else if (this.dragState.isDragging) {
			this.handleDragMove(e);
		}
	}

	private handlePaintMove(e: MouseEvent) {
		if (!this.gridEl) return;

		const rect = this.gridEl.getBoundingClientRect();
		const scrollTop = this.gridEl.scrollTop;
		const y = e.clientY - rect.top + scrollTop;

		// Calculate slot from y position
		// Header is 40px, each slot is 15px
		const headerHeight = 40;
		const slotHeight = 15;
		const slot = Math.floor((y - headerHeight) / slotHeight);
		const clampedSlot = Math.max(0, Math.min(95, slot));

		this.paintState.endSlot = clampedSlot;
		this.updatePaintPreview();
	}

	private handleMouseUp(e: MouseEvent) {
		document.removeEventListener("mousemove", this.boundMouseMove);
		document.removeEventListener("mouseup", this.boundMouseUp);

		if (this.paintState.isPainting) {
			this.handlePaintEnd();
		} else if (this.dragState.isDragging) {
			this.handleDragEnd();
		}
	}

	private handlePaintEnd() {
		const { dayIndex, startSlot, endSlot } = this.paintState;

		// Normalize slots (ensure start < end)
		const minSlot = Math.min(startSlot, endSlot);
		const maxSlot = Math.max(startSlot, endSlot) + 1; // +1 to include end slot

		this.paintState.isPainting = false;

		// Show inline editor
		this.showInlineEditor(dayIndex, minSlot, maxSlot);
	}

	private showPaintPreview() {
		if (!this.gridEl) return;

		this.paintPreviewEl = this.gridEl.createDiv({ cls: "tt-paint-preview" });
		this.updatePaintPreview();
	}

	private updatePaintPreview() {
		if (!this.paintPreviewEl) return;

		const { dayIndex, startSlot, endSlot } = this.paintState;
		const minSlot = Math.min(startSlot, endSlot);
		const maxSlot = Math.max(startSlot, endSlot) + 1;

		this.paintPreviewEl.style.gridColumn = String(dayIndex + 2);
		this.paintPreviewEl.style.gridRow = `${minSlot + 2} / ${maxSlot + 2}`;
	}

	private hidePaintPreview() {
		if (this.paintPreviewEl) {
			this.paintPreviewEl.remove();
			this.paintPreviewEl = null;
		}
	}

	private showInlineEditor(dayIndex: number, startSlot: number, endSlot: number) {
		if (!this.gridEl) return;

		removeInlineEditor(this.inlineEditorEl);

		const position = {
			gridColumn: String(dayIndex + 2),
			gridRow: `${startSlot + 2} / ${endSlot + 2}`,
		};

		this.inlineEditorEl = createInlineEditor(this.gridEl, "", {
			onConfirm: async (text) => {
				await this.createEntry(dayIndex, startSlot, endSlot, text);
				this.hideInlineEditor();
			},
			onCancel: () => {
				this.hideInlineEditor();
			},
		}, position);

		this.hidePaintPreview();
	}

	private hideInlineEditor() {
		removeInlineEditor(this.inlineEditorEl);
		this.inlineEditorEl = null;
		this.hidePaintPreview();
	}

	private async createEntry(dayIndex: number, startSlot: number, endSlot: number, description: string) {
		const date = formatDate(this.weekDates[dayIndex]);
		const startTime = slotToTime(startSlot);
		const endTime = slotToTime(endSlot);

		// Parse tags from description
		const tags: string[] = [];
		const tagMatches = description.match(/#\w+/g);
		if (tagMatches) {
			tags.push(...tagMatches.map((t) => t.slice(1)));
		}

		await this.options.storage.addEntry({
			date,
			startTime,
			endTime,
			description: description.replace(/#\w+/g, "").trim(),
			tags,
			isPomodoro: false,
			isBreak: false,
		});

		await this.render();
	}

	private handleEditEntry(entry: TimeEntry) {
		if (!this.gridEl) return;

		// Find day index
		const dayIndex = this.weekDates.findIndex((d) => formatDate(d) === entry.date);
		if (dayIndex === -1) return;

		const startSlot = timeToSlot(entry.startTime);
		const endSlot = timeToSlot(entry.endTime);

		// Show editor with existing text
		const existingText = entry.description + (entry.tags.length ? " " + entry.tags.map((t) => `#${t}`).join(" ") : "");

		removeInlineEditor(this.inlineEditorEl);

		const position = {
			gridColumn: String(dayIndex + 2),
			gridRow: `${startSlot + 2} / ${endSlot + 2}`,
		};

		this.inlineEditorEl = createInlineEditor(this.gridEl, existingText, {
			onConfirm: async (text) => {
				const tags: string[] = [];
				const tagMatches = text.match(/#\w+/g);
				if (tagMatches) {
					tags.push(...tagMatches.map((t) => t.slice(1)));
				}

				await this.options.storage.updateEntry(entry.id, {
					description: text.replace(/#\w+/g, "").trim(),
					tags,
				});

				this.hideInlineEditor();
				await this.render();
			},
			onCancel: () => {
				this.hideInlineEditor();
			},
		}, position);
	}

	private handleResizeStart(entry: TimeEntry, edge: "top" | "bottom", e: MouseEvent) {
		e.preventDefault();

		const dayIndex = this.weekDates.findIndex((d) => formatDate(d) === entry.date);
		if (dayIndex === -1) return;

		this.dragState = {
			isDragging: true,
			entry,
			mode: edge === "top" ? "resize-top" : "resize-bottom",
			initialMouseY: e.clientY,
			initialStartSlot: timeToSlot(entry.startTime),
			initialEndSlot: timeToSlot(entry.endTime),
			dayIndex,
		};

		document.addEventListener("mousemove", this.boundMouseMove);
		document.addEventListener("mouseup", this.boundMouseUp);
	}

	private handleDragStart(entry: TimeEntry, e: MouseEvent) {
		e.preventDefault();

		const dayIndex = this.weekDates.findIndex((d) => formatDate(d) === entry.date);
		if (dayIndex === -1) return;

		this.dragState = {
			isDragging: true,
			entry,
			mode: "move",
			initialMouseY: e.clientY,
			initialStartSlot: timeToSlot(entry.startTime),
			initialEndSlot: timeToSlot(entry.endTime),
			dayIndex,
		};

		document.addEventListener("mousemove", this.boundMouseMove);
		document.addEventListener("mouseup", this.boundMouseUp);
	}

	private handleDragMove(e: MouseEvent) {
		if (!this.gridEl || !this.dragState.entry) return;

		const slotHeight = 15;
		const deltaY = e.clientY - this.dragState.initialMouseY;
		const deltaSlots = Math.round(deltaY / slotHeight);

		const entryEl = this.gridEl.querySelector(`[data-entry-id="${this.dragState.entry.id}"]`) as HTMLElement;
		if (!entryEl) return;

		let newStartSlot = this.dragState.initialStartSlot;
		let newEndSlot = this.dragState.initialEndSlot;

		if (this.dragState.mode === "move") {
			newStartSlot = Math.max(0, Math.min(95, this.dragState.initialStartSlot + deltaSlots));
			const duration = this.dragState.initialEndSlot - this.dragState.initialStartSlot;
			newEndSlot = Math.min(96, newStartSlot + duration);
			newStartSlot = newEndSlot - duration;
		} else if (this.dragState.mode === "resize-top") {
			newStartSlot = Math.max(0, Math.min(this.dragState.initialEndSlot - 1, this.dragState.initialStartSlot + deltaSlots));
		} else if (this.dragState.mode === "resize-bottom") {
			newEndSlot = Math.max(this.dragState.initialStartSlot + 1, Math.min(96, this.dragState.initialEndSlot + deltaSlots));
		}

		entryEl.style.gridRow = `${newStartSlot + 2} / ${newEndSlot + 2}`;
	}

	private async handleDragEnd() {
		if (!this.gridEl || !this.dragState.entry) {
			this.dragState.isDragging = false;
			return;
		}

		const entryEl = this.gridEl.querySelector(`[data-entry-id="${this.dragState.entry.id}"]`) as HTMLElement;
		if (!entryEl) {
			this.dragState.isDragging = false;
			return;
		}

		// Parse final position from grid-row
		const gridRow = entryEl.style.gridRow;
		const match = gridRow.match(/(\d+)\s*\/\s*(\d+)/);
		if (match) {
			const newStartSlot = parseInt(match[1]) - 2;
			const newEndSlot = parseInt(match[2]) - 2;

			// Only save if position actually changed
			if (newStartSlot !== this.dragState.initialStartSlot || newEndSlot !== this.dragState.initialEndSlot) {
				await this.options.storage.updateEntry(this.dragState.entry.id, {
					startTime: slotToTime(newStartSlot),
					endTime: slotToTime(newEndSlot),
				});
				this.dragState.isDragging = false;
				await this.render();
				return;
			}
		}

		this.dragState.isDragging = false;
		// No render needed if nothing changed
	}

	setCurrentDate(date: Date) {
		this.options.currentDate = date;
		this.weekDates = getWeekDates(date, this.options.weekStartDay);
		this.render();
	}

	getCurrentDate(): Date {
		return this.options.currentDate;
	}

	destroy() {
		document.removeEventListener("mousemove", this.boundMouseMove);
		document.removeEventListener("mouseup", this.boundMouseUp);
	}
}
