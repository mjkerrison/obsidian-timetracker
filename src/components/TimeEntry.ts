import { TimeEntry as TimeEntryData } from "../types";
import { parseTimeToMinutes, formatDuration } from "../utils/time";

export interface TimeEntryCallbacks {
	onEdit: (entry: TimeEntryData) => void;
	onResizeStart: (entry: TimeEntryData, edge: "top" | "bottom", e: MouseEvent) => void;
	onDragStart: (entry: TimeEntryData, e: MouseEvent) => void;
}

export function createTimeEntryElement(
	entry: TimeEntryData,
	callbacks: TimeEntryCallbacks,
	dayIndex: number
): HTMLElement {
	const startMinutes = parseTimeToMinutes(entry.startTime);
	const endMinutes = parseTimeToMinutes(entry.endTime);
	const durationMinutes = endMinutes - startMinutes;

	const startSlot = Math.floor(startMinutes / 15);
	const endSlot = Math.ceil(endMinutes / 15);
	const slotSpan = endSlot - startSlot;

	const el = document.createElement("div");
	el.className = "tt-entry";
	el.dataset.entryId = entry.id;

	if (entry.isPomodoro) {
		el.classList.add("tt-entry-pomodoro");
	}
	if (entry.isBreak) {
		el.classList.add("tt-entry-break");
	}

	// Position using CSS grid
	el.style.gridColumn = String(dayIndex + 2); // +2 for time gutter column
	el.style.gridRow = `${startSlot + 2} / ${endSlot + 2}`; // +2 for header row

	// Content
	const content = el.createDiv({ cls: "tt-entry-content" });

	const titleEl = content.createDiv({ cls: "tt-entry-title" });
	titleEl.textContent = entry.description || "(no description)";

	const timeEl = content.createDiv({ cls: "tt-entry-time" });
	timeEl.textContent = `${entry.startTime} - ${entry.endTime} (${formatDuration(durationMinutes)})`;

	if (entry.tags.length > 0) {
		const tagsEl = content.createDiv({ cls: "tt-entry-tags" });
		entry.tags.forEach((tag) => {
			const tagEl = tagsEl.createSpan({ cls: "tt-entry-tag" });
			tagEl.textContent = `#${tag}`;
		});
	}

	// Resize handles
	const topHandle = el.createDiv({ cls: "tt-entry-handle tt-entry-handle-top" });
	const bottomHandle = el.createDiv({ cls: "tt-entry-handle tt-entry-handle-bottom" });

	// Event handlers
	topHandle.addEventListener("mousedown", (e) => {
		e.stopPropagation();
		callbacks.onResizeStart(entry, "top", e);
	});

	bottomHandle.addEventListener("mousedown", (e) => {
		e.stopPropagation();
		callbacks.onResizeStart(entry, "bottom", e);
	});

	el.addEventListener("dblclick", (e) => {
		e.stopPropagation();
		callbacks.onEdit(entry);
	});

	el.addEventListener("mousedown", (e) => {
		// Only start drag if not clicking on handles
		if (!(e.target as HTMLElement).classList.contains("tt-entry-handle")) {
			callbacks.onDragStart(entry, e);
		}
	});

	return el;
}
