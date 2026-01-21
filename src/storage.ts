import { App, TFile, Notice } from "obsidian";
import { TimeEntry, TimeTrackerSettings } from "./types";

// 2025-01-21 11:00 - 12:30 | Meeting with team #work
const ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\|\s*(.+)$/;

/**
 * Generate a stable ID based on entry content.
 * This ensures IDs remain consistent across file reloads.
 */
function generateStableId(date: string, startTime: string, endTime: string): string {
	return `${date}_${startTime}_${endTime}`.replace(/[:-]/g, "");
}

export class TimeTrackerStorage {
	private app: App;
	private settings: TimeTrackerSettings;
	private entries: TimeEntry[] = [];
	private fileWatcherUnregister: (() => void) | null = null;
	private listeners: Set<() => void> = new Set();
	private isSaving: boolean = false; // Track when we're saving to ignore our own file events
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
			// Ignore our own file modifications
			if (this.isSaving) return;

			if (file instanceof TFile && file.path === this.settings.filePath) {
				// Skip reload if user is currently editing this file
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.path === this.settings.filePath) {
					return;
				}

				// Debounce for external changes
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

	private parseContent(content: string): TimeEntry[] {
		const lines = content.split("\n");
		const entries: TimeEntry[] = [];

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

		// Extract tags (words starting with #)
		const tagMatches = desc.match(/#\w+/g);
		if (tagMatches) {
			tags.push(...tagMatches.map((t) => t.slice(1)));
		}

		// Check for pomodoro marker
		if (desc.includes("(pomodoro)")) {
			isPomodoro = true;
		}

		// Check for break
		if (desc.toLowerCase().trim() === "break" || desc.toLowerCase().includes("(break)")) {
			isBreak = true;
		}

		// Clean description (remove tags and markers for display)
		let description = desc
			.replace(/#\w+/g, "")
			.replace(/\(pomodoro\)/gi, "")
			.replace(/\(break\)/gi, "")
			.trim();

		return { description, tags, isPomodoro, isBreak };
	}

	private formatEntry(entry: TimeEntry): string {
		let desc = entry.description;

		// Add tags
		if (entry.tags.length > 0) {
			desc += " " + entry.tags.map((t) => `#${t}`).join(" ");
		}

		// Add markers
		if (entry.isPomodoro) {
			desc += " (pomodoro)";
		}
		if (entry.isBreak && !desc.toLowerCase().includes("break")) {
			desc = "Break";
		}

		return `${entry.date} ${entry.startTime} - ${entry.endTime} | ${desc}`;
	}

	async saveEntries(): Promise<void> {
		// Sort entries by date and start time
		const sorted = [...this.entries].sort((a, b) => {
			const dateCompare = a.date.localeCompare(b.date);
			if (dateCompare !== 0) return dateCompare;
			return a.startTime.localeCompare(b.startTime);
		});

		const content = sorted.map((e) => this.formatEntry(e)).join("\n");

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
			// Delay clearing the flag to ensure file watcher event has passed
			setTimeout(() => {
				this.isSaving = false;
			}, 100);
		}
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
		const newEntry: TimeEntry = {
			...entry,
			id: generateStableId(entry.date, entry.startTime, entry.endTime),
		};
		this.entries.push(newEntry);
		await this.saveEntries();
		// Note: caller is responsible for re-rendering; notifyListeners is only for external file changes
		return newEntry;
	}

	async updateEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
		const index = this.entries.findIndex((e) => e.id === id);
		if (index !== -1) {
			const updated = { ...this.entries[index], ...updates };
			// Regenerate stable ID if time-related fields changed
			updated.id = generateStableId(updated.date, updated.startTime, updated.endTime);
			this.entries[index] = updated;
			await this.saveEntries();
			// Note: caller is responsible for re-rendering
		}
	}

	async deleteEntry(id: string): Promise<void> {
		const index = this.entries.findIndex((e) => e.id === id);
		if (index !== -1) {
			this.entries.splice(index, 1);
			await this.saveEntries();
			// Note: caller is responsible for re-rendering
		}
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
