import { App, TFile, Notice } from "obsidian";
import { TimeEntry, TimeTrackerSettings } from "./types";

// 2025-01-21 11:00 - 12:30 | Meeting with team #work
const ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\|\s*(.*)$/;

/**
 * Generate a stable ID based on entry content.
 * This ensures IDs remain consistent across file reloads.
 */
function generateStableId(date: string, startTime: string, endTime: string): string {
	return `${date}_${startTime}_${endTime}`.replace(/[:-]/g, "");
}

interface ParsedEntry extends TimeEntry {
	originalLine: string; // Store original line for matching during updates
}

export class TimeTrackerStorage {
	private app: App;
	private settings: TimeTrackerSettings;
	private entries: ParsedEntry[] = [];
	private fileWatcherUnregister: (() => void) | null = null;
	private listeners: Set<() => void> = new Set();
	private isSaving: boolean = false;
	private fileWatcherDebounceTimer: number | null = null;

	constructor(app: App, settings: TimeTrackerSettings) {
		this.app = app;
		this.settings = settings;
		this.setupFileWatcher();
	}

	updateSettings(settings: TimeTrackerSettings) {
		const pathChanged = this.settings.filePath !== settings.filePath;
		this.settings = settings;
		if (pathChanged) {
			this.entries = [];
			this.setupFileWatcher();
		}
	}

	private setupFileWatcher() {
		if (this.fileWatcherUnregister) {
			this.fileWatcherUnregister();
		}

		const handler = this.app.vault.on("modify", (file) => {
			if (this.isSaving) return;

			if (file instanceof TFile && file.path === this.settings.filePath) {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.path === this.settings.filePath) {
					return;
				}

				if (this.fileWatcherDebounceTimer) {
					window.clearTimeout(this.fileWatcherDebounceTimer);
				}
				this.fileWatcherDebounceTimer = window.setTimeout(() => {
					this.fileWatcherDebounceTimer = null;
					this.loadEntries().then(() => this.notifyListeners());
				}, 500);
			}
		});

		this.fileWatcherUnregister = () => this.app.vault.offref(handler);
	}

	addListener(callback: () => void) {
		this.listeners.add(callback);
	}

	removeListener(callback: () => void) {
		this.listeners.delete(callback);
	}

	private notifyListeners() {
		this.listeners.forEach((cb) => cb());
	}

	async loadEntries(): Promise<TimeEntry[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.settings.filePath);
			if (!(file instanceof TFile)) {
				this.entries = [];
				return this.entries;
			}

			const content = await this.app.vault.read(file);
			this.entries = this.parseContent(content);
			return this.entries;
		} catch (error) {
			console.error("Failed to load time entries:", error);
			this.entries = [];
			return this.entries;
		}
	}

	private parseContent(content: string): ParsedEntry[] {
		const lines = content.split("\n");
		const entries: ParsedEntry[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const match = trimmed.match(ENTRY_REGEX);
			if (match) {
				const [, date, startTime, endTime, descriptionPart] = match;
				const { description, tags, isPomodoro, isBreak } = this.parseDescription(descriptionPart);

				entries.push({
					id: generateStableId(date, startTime, endTime),
					date,
					startTime,
					endTime,
					description,
					tags,
					isPomodoro,
					isBreak,
					originalLine: trimmed,
				});
			}
		}

		return entries;
	}

	private parseDescription(desc: string): {
		description: string;
		tags: string[];
		isPomodoro: boolean;
		isBreak: boolean;
	} {
		const tags: string[] = [];
		let isPomodoro = false;
		let isBreak = false;

		const tagMatches = desc.match(/#\w+/g);
		if (tagMatches) {
			tags.push(...tagMatches.map((t) => t.slice(1)));
		}

		if (desc.includes("(pomodoro)")) {
			isPomodoro = true;
		}

		if (desc.toLowerCase().trim() === "break" || desc.toLowerCase().includes("(break)")) {
			isBreak = true;
		}

		let description = desc
			.replace(/#\w+/g, "")
			.replace(/\(pomodoro\)/gi, "")
			.replace(/\(break\)/gi, "")
			.trim();

		return { description, tags, isPomodoro, isBreak };
	}

	private formatEntry(entry: TimeEntry): string {
		let desc = entry.description;

		if (entry.tags.length > 0) {
			desc += " " + entry.tags.map((t) => `#${t}`).join(" ");
		}

		if (entry.isPomodoro) {
			desc += " (pomodoro)";
		}
		if (entry.isBreak && !desc.toLowerCase().includes("break")) {
			desc = "Break";
		}

		return `${entry.date} ${entry.startTime} - ${entry.endTime} | ${desc}`;
	}

	/**
	 * Read the current file content
	 */
	private async readFile(): Promise<string | null> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.settings.filePath);
			if (file instanceof TFile) {
				return await this.app.vault.read(file);
			}
			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Write content to file, creating if necessary
	 */
	private async writeFile(content: string): Promise<void> {
		try {
			this.isSaving = true;
			const file = this.app.vault.getAbstractFileByPath(this.settings.filePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(this.settings.filePath, content);
			}
		} catch (error) {
			console.error("Failed to save time entries:", error);
			new Notice("Failed to save time entries");
		} finally {
			setTimeout(() => {
				this.isSaving = false;
			}, 100);
		}
	}

	/**
	 * Find a line in the file content and replace it
	 */
	private replaceLineInContent(content: string, oldLine: string, newLine: string): string {
		const lines = content.split("\n");
		const index = lines.findIndex((l) => l.trim() === oldLine);
		if (index !== -1) {
			lines[index] = newLine;
		}
		return lines.join("\n");
	}

	/**
	 * Find a line in the file content and remove it
	 */
	private removeLineFromContent(content: string, lineToRemove: string): string {
		const lines = content.split("\n");
		const index = lines.findIndex((l) => l.trim() === lineToRemove);
		if (index !== -1) {
			lines.splice(index, 1);
		}
		return lines.join("\n");
	}

	/**
	 * Append a line to the file content
	 */
	private appendLineToContent(content: string, newLine: string): string {
		if (!content) {
			return newLine;
		}
		// Ensure there's a newline at the end before appending
		if (!content.endsWith("\n")) {
			content += "\n";
		}
		return content + newLine;
	}

	getEntries(): TimeEntry[] {
		return this.entries;
	}

	getEntriesForDate(date: string): TimeEntry[] {
		return this.entries.filter((e) => e.date === date);
	}

	getEntriesForDateRange(startDate: string, endDate: string): TimeEntry[] {
		return this.entries.filter((e) => e.date >= startDate && e.date <= endDate);
	}

	async addEntry(entry: Omit<TimeEntry, "id">): Promise<TimeEntry> {
		const newEntry: ParsedEntry = {
			...entry,
			id: generateStableId(entry.date, entry.startTime, entry.endTime),
			originalLine: "", // Will be set after formatting
		};

		const formattedLine = this.formatEntry(newEntry);
		newEntry.originalLine = formattedLine;

		// Read current file and append
		let content = (await this.readFile()) || "";
		content = this.appendLineToContent(content, formattedLine);
		await this.writeFile(content);

		this.entries.push(newEntry);
		return newEntry;
	}

	async updateEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
		const index = this.entries.findIndex((e) => e.id === id);
		if (index === -1) return;

		const oldEntry = this.entries[index];
		const oldLine = oldEntry.originalLine;

		// Apply updates
		const updated: ParsedEntry = { ...oldEntry, ...updates };
		updated.id = generateStableId(updated.date, updated.startTime, updated.endTime);

		const newLine = this.formatEntry(updated);
		updated.originalLine = newLine;

		// Read current file and replace the line
		const content = await this.readFile();
		if (content !== null) {
			const newContent = this.replaceLineInContent(content, oldLine, newLine);
			await this.writeFile(newContent);
		}

		this.entries[index] = updated;
	}

	async deleteEntry(id: string): Promise<void> {
		const index = this.entries.findIndex((e) => e.id === id);
		if (index === -1) return;

		const entry = this.entries[index];
		const lineToRemove = entry.originalLine;

		// Read current file and remove the line
		const content = await this.readFile();
		if (content !== null) {
			const newContent = this.removeLineFromContent(content, lineToRemove);
			await this.writeFile(newContent);
		}

		this.entries.splice(index, 1);
	}

	getTotalMinutesForDate(date: string): number {
		const entries = this.getEntriesForDate(date);
		return entries.reduce((total, entry) => {
			const [startH, startM] = entry.startTime.split(":").map(Number);
			const [endH, endM] = entry.endTime.split(":").map(Number);
			const startMinutes = startH * 60 + startM;
			const endMinutes = endH * 60 + endM;
			return total + (endMinutes - startMinutes);
		}, 0);
	}

	destroy() {
		if (this.fileWatcherDebounceTimer) {
			window.clearTimeout(this.fileWatcherDebounceTimer);
		}
		if (this.fileWatcherUnregister) {
			this.fileWatcherUnregister();
		}
		this.listeners.clear();
	}
}
