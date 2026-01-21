import { ItemView, WorkspaceLeaf } from "obsidian";
import type TimeTrackerPlugin from "../main";
import { VIEW_TYPE_LIVE } from "../types";
import { PomodoroTimer, TimerMode, TimerState } from "../components/PomodoroTimer";
import { playTimerComplete, playBreakComplete } from "../utils/audio";
import { showNotification, requestNotificationPermission } from "../utils/notifications";
import { formatDate, formatTime, formatDuration, getToday } from "../utils/time";

export class LiveCaptureView extends ItemView {
	plugin: TimeTrackerPlugin;
	private timer: PomodoroTimer | null = null;
	private isPomodoroMode: boolean = false;

	// UI Elements
	private timerDisplayEl: HTMLElement | null = null;
	private timerStatusEl: HTMLElement | null = null;
	private taskInputEl: HTMLInputElement | null = null;
	private startBtnEl: HTMLButtonElement | null = null;
	private stopBtnEl: HTMLButtonElement | null = null;
	private pomodoroBtnEl: HTMLButtonElement | null = null;
	private todayTotalEl: HTMLElement | null = null;
	private pomodoroDotsEl: HTMLElement | null = null;

	// Stopwatch mode (non-pomodoro)
	private stopwatchInterval: number | null = null;
	private stopwatchStart: Date | null = null;
	private stopwatchElapsed: number = 0;
	private storageListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TimeTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LIVE;
	}

	getDisplayText(): string {
		return "Time Tracker - Live Capture";
	}

	getIcon(): string {
		return "timer";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("tt-live-view");

		// Initialize timer
		this.initTimer();

		// Timer Section
		this.renderTimerSection(container as HTMLElement);

		// Quick Offset Section
		this.renderOffsetSection(container as HTMLElement);

		// Today Stats Section
		this.renderStatsSection(container as HTMLElement);

		// Load initial data
		await this.updateTodayStats();

		// Request notification permission
		requestNotificationPermission();

		// Listen for storage changes
		this.storageListener = () => this.updateTodayStats();
		this.plugin.storage.addListener(this.storageListener);
	}

	private initTimer() {
		this.timer = new PomodoroTimer({
			workMinutes: this.plugin.settings.pomodoroWorkMinutes,
			breakMinutes: this.plugin.settings.pomodoroBreakMinutes,
			longBreakMinutes: this.plugin.settings.pomodoroLongBreakMinutes,
			pomodorosBeforeLongBreak: this.plugin.settings.pomodorosBeforeLongBreak,
			onTick: (remaining, mode) => this.handleTimerTick(remaining, mode),
			onComplete: (mode, start, end) => this.handleTimerComplete(mode, start, end),
		});
	}

	private renderTimerSection(container: HTMLElement) {
		const section = container.createDiv({ cls: "tt-live-section" });
		section.createDiv({ cls: "tt-live-section-title", text: "Timer" });

		// Timer display
		const timerDisplay = section.createDiv({ cls: "tt-timer-display" });
		this.timerDisplayEl = timerDisplay.createDiv({ cls: "tt-timer-time", text: "00:00" });
		this.timerStatusEl = timerDisplay.createDiv({ cls: "tt-timer-status", text: "Ready" });

		// Task input
		const inputContainer = section.createDiv({ cls: "tt-task-input-container" });
		this.taskInputEl = inputContainer.createEl("input", {
			cls: "tt-task-input",
			type: "text",
			placeholder: "What are you working on?",
		});

		// Controls
		const controls = section.createDiv({ cls: "tt-timer-controls" });

		this.startBtnEl = controls.createEl("button", {
			cls: "tt-timer-btn tt-timer-btn-start",
			text: "Start",
		});
		this.startBtnEl.addEventListener("click", () => this.handleStart());

		this.stopBtnEl = controls.createEl("button", {
			cls: "tt-timer-btn tt-timer-btn-stop",
			text: "Stop",
		});
		this.stopBtnEl.style.display = "none";
		this.stopBtnEl.addEventListener("click", () => this.handleStop());

		this.pomodoroBtnEl = controls.createEl("button", {
			cls: "tt-timer-btn tt-timer-btn-pomodoro",
			text: "🍅 Pomodoro",
		});
		this.pomodoroBtnEl.addEventListener("click", () => this.togglePomodoroMode());

		// Pomodoro progress dots
		this.pomodoroDotsEl = section.createDiv({ cls: "tt-pomodoro-counter" });
		this.pomodoroDotsEl.style.display = "none";
		this.updatePomodoroDots();
	}

	private renderOffsetSection(container: HTMLElement) {
		const section = container.createDiv({ cls: "tt-live-section tt-offset-section" });
		section.createDiv({ cls: "tt-live-section-title", text: "Quick Start" });

		const label = section.createDiv({ cls: "tt-offset-label", text: "Started X minutes ago:" });

		const buttons = section.createDiv({ cls: "tt-offset-buttons" });

		this.plugin.settings.quickOffsets.forEach((minutes) => {
			const btn = buttons.createEl("button", {
				cls: "tt-offset-btn",
				text: `${minutes} min`,
			});
			btn.addEventListener("click", () => this.handleQuickOffset(minutes));
		});
	}

	private renderStatsSection(container: HTMLElement) {
		const section = container.createDiv({ cls: "tt-live-section" });
		section.createDiv({ cls: "tt-live-section-title", text: "Today" });

		const stats = section.createDiv({ cls: "tt-today-stats" });
		this.todayTotalEl = stats.createDiv({ cls: "tt-today-total", text: "0h 0m" });
		stats.createDiv({ cls: "tt-today-label", text: "Total tracked" });
	}

	private async updateTodayStats() {
		await this.plugin.storage.loadEntries();
		const totalMinutes = this.plugin.storage.getTotalMinutesForDate(getToday());
		if (this.todayTotalEl) {
			this.todayTotalEl.textContent = formatDuration(totalMinutes);
		}
	}

	private handleTimerTick(remaining: number, mode: TimerMode) {
		if (this.timerDisplayEl) {
			this.timerDisplayEl.textContent = this.timer?.getFormattedTime() || "00:00";
		}
	}

	private async handleTimerComplete(mode: TimerMode, startTime: Date, endTime: Date) {
		// Play sound
		if (this.plugin.settings.soundEnabled) {
			if (mode === "work") {
				playTimerComplete();
			} else {
				playBreakComplete();
			}
		}

		// Show notification
		if (this.plugin.settings.notificationsEnabled) {
			if (mode === "work") {
				showNotification("Pomodoro Complete! 🍅", "Time for a break.");
			} else {
				showNotification("Break Over!", "Ready to start another pomodoro?");
			}
		}

		// Create entry for work session
		if (mode === "work") {
			const description = this.taskInputEl?.value || "Pomodoro session";
			await this.createEntry(startTime, endTime, description, true);
		} else {
			// Create break entry
			await this.createEntry(startTime, endTime, "Break", false, true);
		}

		// Update UI
		this.updateTimerUI();
		this.updatePomodoroDots();
		await this.updateTodayStats();
	}

	private handleStart() {
		if (this.isPomodoroMode) {
			this.timer?.start();
		} else {
			// Stopwatch mode
			this.stopwatchStart = new Date();
			this.stopwatchElapsed = 0;
			this.stopwatchInterval = window.setInterval(() => {
				this.stopwatchElapsed++;
				if (this.timerDisplayEl) {
					const mins = Math.floor(this.stopwatchElapsed / 60);
					const secs = this.stopwatchElapsed % 60;
					this.timerDisplayEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
				}
			}, 1000);
		}

		this.updateTimerUI();
	}

	private async handleStop() {
		const description = this.taskInputEl?.value || "Time entry";

		if (this.isPomodoroMode) {
			const startTime = this.timer?.getStartTime();
			if (startTime) {
				await this.createEntry(startTime, new Date(), description, true);
			}
			this.timer?.stop();
		} else {
			// Stopwatch mode
			if (this.stopwatchInterval) {
				clearInterval(this.stopwatchInterval);
				this.stopwatchInterval = null;
			}
			if (this.stopwatchStart) {
				await this.createEntry(this.stopwatchStart, new Date(), description, false);
				this.stopwatchStart = null;
			}
			this.stopwatchElapsed = 0;
			if (this.timerDisplayEl) {
				this.timerDisplayEl.textContent = "00:00";
			}
		}

		this.updateTimerUI();
		await this.updateTodayStats();
	}

	private async handleQuickOffset(minutesAgo: number) {
		const description = this.taskInputEl?.value || "Time entry";
		const startTime = new Date(Date.now() - minutesAgo * 60 * 1000);
		const endTime = new Date();

		await this.createEntry(startTime, endTime, description, false);
		await this.updateTodayStats();
	}

	private togglePomodoroMode() {
		this.isPomodoroMode = !this.isPomodoroMode;

		if (this.pomodoroBtnEl) {
			if (this.isPomodoroMode) {
				this.pomodoroBtnEl.classList.add("tt-active");
			} else {
				this.pomodoroBtnEl.classList.remove("tt-active");
			}
		}

		if (this.pomodoroDotsEl) {
			this.pomodoroDotsEl.style.display = this.isPomodoroMode ? "flex" : "none";
		}

		// Reset timers
		this.timer?.stop();
		if (this.stopwatchInterval) {
			clearInterval(this.stopwatchInterval);
			this.stopwatchInterval = null;
		}
		this.stopwatchStart = null;
		this.stopwatchElapsed = 0;

		this.updateTimerUI();
	}

	private updateTimerUI() {
		const isRunning = this.isPomodoroMode
			? this.timer?.getState() === "running"
			: this.stopwatchInterval !== null;

		if (this.startBtnEl) {
			this.startBtnEl.style.display = isRunning ? "none" : "inline-block";
		}
		if (this.stopBtnEl) {
			this.stopBtnEl.style.display = isRunning ? "inline-block" : "none";
		}

		if (this.timerStatusEl) {
			if (isRunning) {
				this.timerStatusEl.textContent = this.isPomodoroMode
					? `${this.timer?.getMode() === "work" ? "Working" : "Break"}`
					: "Tracking...";
				this.timerStatusEl.className = "tt-timer-status tt-timer-running";
			} else {
				this.timerStatusEl.textContent = this.isPomodoroMode ? "Pomodoro Ready" : "Ready";
				this.timerStatusEl.className = "tt-timer-status";
			}
		}

		if (this.timerDisplayEl && !isRunning) {
			if (this.isPomodoroMode) {
				this.timerDisplayEl.textContent = this.timer?.getFormattedTime() || "25:00";
			} else {
				this.timerDisplayEl.textContent = "00:00";
			}
		}
	}

	private updatePomodoroDots() {
		if (!this.pomodoroDotsEl) return;

		this.pomodoroDotsEl.empty();

		const total = this.plugin.settings.pomodorosBeforeLongBreak;
		const completed = this.timer?.getCompletedPomodoros() || 0;

		for (let i = 0; i < total; i++) {
			const dot = this.pomodoroDotsEl.createDiv({ cls: "tt-pomodoro-dot" });
			if (i < completed) {
				dot.classList.add("tt-completed");
			}
		}
	}

	private async createEntry(
		startTime: Date,
		endTime: Date,
		description: string,
		isPomodoro: boolean,
		isBreak: boolean = false
	) {
		// Parse tags from description
		const tags: string[] = [];
		const tagMatches = description.match(/#\w+/g);
		if (tagMatches) {
			tags.push(...tagMatches.map((t) => t.slice(1)));
		}

		await this.plugin.storage.addEntry({
			date: formatDate(startTime),
			startTime: formatTime(startTime),
			endTime: formatTime(endTime),
			description: description.replace(/#\w+/g, "").trim(),
			tags,
			isPomodoro,
			isBreak,
		});
	}

	refresh() {
		// Update timer options from settings
		if (this.timer) {
			this.timer.updateOptions({
				workMinutes: this.plugin.settings.pomodoroWorkMinutes,
				breakMinutes: this.plugin.settings.pomodoroBreakMinutes,
				longBreakMinutes: this.plugin.settings.pomodoroLongBreakMinutes,
				pomodorosBeforeLongBreak: this.plugin.settings.pomodorosBeforeLongBreak,
			});
		}

		// Re-render offset buttons
		const offsetSection = this.containerEl.querySelector(".tt-offset-section");
		if (offsetSection) {
			const buttons = offsetSection.querySelector(".tt-offset-buttons");
			if (buttons) {
				buttons.empty();
				this.plugin.settings.quickOffsets.forEach((minutes) => {
					const btn = buttons.createEl("button", {
						cls: "tt-offset-btn",
						text: `${minutes} min`,
					});
					btn.addEventListener("click", () => this.handleQuickOffset(minutes));
				});
			}
		}

		this.updateTodayStats();
		this.updatePomodoroDots();
	}

	async onClose() {
		// Clean up intervals
		if (this.stopwatchInterval) {
			clearInterval(this.stopwatchInterval);
		}
		if (this.storageListener) {
			this.plugin.storage.removeListener(this.storageListener);
			this.storageListener = null;
		}
	}
}
