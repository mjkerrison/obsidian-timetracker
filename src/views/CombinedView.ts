import { ItemView, WorkspaceLeaf } from "obsidian";
import type TimeTrackerPlugin from "../main";
import { VIEW_TYPE_COMBINED, TimeEntry } from "../types";
import { WeekGrid } from "../components/WeekGrid";
import { PomodoroTimer, TimerMode } from "../components/PomodoroTimer";
import { playTimerComplete, playBreakComplete } from "../utils/audio";
import { showNotification, requestNotificationPermission } from "../utils/notifications";
import {
	formatDate,
	formatTime,
	formatDuration,
	getMonthName,
	getToday,
	parseTimeToMinutes,
	minutesToTime,
} from "../utils/time";

const DEFAULT_BACKFILL_MINUTES = 30;
const MAX_END_MINUTES = 1425; // 23:45 — cap so endTime stays valid HH:MM within the day

export class CombinedView extends ItemView {
	plugin: TimeTrackerPlugin;

	// Week section
	private weekGrid: WeekGrid | null = null;
	private currentDate: Date = new Date();
	private headerEl: HTMLElement | null = null;

	// Live section
	private timer: PomodoroTimer | null = null;
	private isPomodoroMode = false;
	private timerDisplayEl: HTMLElement | null = null;
	private timerStatusEl: HTMLElement | null = null;
	private taskInputEl: HTMLInputElement | null = null;
	private startBtnEl: HTMLButtonElement | null = null;
	private stopBtnEl: HTMLButtonElement | null = null;
	private pomodoroBtnEl: HTMLButtonElement | null = null;
	private todayTotalEl: HTMLElement | null = null;
	private pomodoroDotsEl: HTMLElement | null = null;
	private offsetButtonsEl: HTMLElement | null = null;

	private stopwatchInterval: number | null = null;
	private stopwatchStart: Date | null = null;
	private stopwatchElapsed = 0;

	private storageListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TimeTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_COMBINED;
	}

	getDisplayText(): string {
		return "Time Tracker";
	}

	getIcon(): string {
		return "calendar-clock";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("tt-combined-view");

		this.renderHeader(container);

		const gridContainer = container.createDiv({ cls: "tt-grid-container tt-combined-grid" });
		this.weekGrid = new WeekGrid(gridContainer, {
			weekStartDay: this.plugin.settings.weekStartDay,
			currentDate: this.currentDate,
			storage: this.plugin.storage,
			workingHoursStart: this.plugin.settings.workingHoursStart,
			workingHoursEnd: this.plugin.settings.workingHoursEnd,
		});

		this.initTimer();
		this.renderLiveFooter(container);
		await this.updateTodayStats();
		requestNotificationPermission();

		this.storageListener = () => {
			this.weekGrid?.render();
			this.updateTodayStats();
		};
		this.plugin.storage.addListener(this.storageListener);
	}

	// ------------------------------------------------------------------
	// Header (week navigation)
	// ------------------------------------------------------------------

	private renderHeader(container: HTMLElement) {
		this.headerEl = container.createDiv({ cls: "tt-week-header" });
		const nav = this.headerEl.createDiv({ cls: "tt-week-nav" });

		const prevWeekBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "‹‹" });
		prevWeekBtn.setAttribute("aria-label", "Previous week");
		prevWeekBtn.addEventListener("click", () => this.navigateWeek(-1));

		const prevDayBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "‹" });
		prevDayBtn.setAttribute("aria-label", "Previous day");
		prevDayBtn.addEventListener("click", () => this.navigateDay(-1));

		const periodDisplay = nav.createDiv({ cls: "tt-period-display" });
		this.updatePeriodDisplay(periodDisplay);

		const todayBtn = nav.createEl("button", { cls: "tt-nav-btn tt-today-btn", text: "Today" });
		todayBtn.addEventListener("click", () => this.goToToday());

		const nextDayBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "›" });
		nextDayBtn.setAttribute("aria-label", "Next day");
		nextDayBtn.addEventListener("click", () => this.navigateDay(1));

		const nextWeekBtn = nav.createEl("button", { cls: "tt-nav-btn", text: "››" });
		nextWeekBtn.setAttribute("aria-label", "Next week");
		nextWeekBtn.addEventListener("click", () => this.navigateWeek(1));
	}

	private updatePeriodDisplay(el?: HTMLElement) {
		const display = el || this.headerEl?.querySelector(".tt-period-display");
		if (!display) return;
		display.empty();
		const date = this.weekGrid ? this.weekGrid.getCurrentDate() : this.currentDate;
		display.textContent = `${getMonthName(date, false)} ${date.getFullYear()}`;
	}

	private navigateDay(delta: number) {
		this.weekGrid?.navigateDay(delta);
		if (this.weekGrid) this.currentDate = this.weekGrid.getCurrentDate();
		this.updatePeriodDisplay();
	}

	private navigateWeek(delta: number) {
		this.weekGrid?.navigateWeek(delta);
		if (this.weekGrid) this.currentDate = this.weekGrid.getCurrentDate();
		this.updatePeriodDisplay();
	}

	private goToToday() {
		this.weekGrid?.goToToday();
		if (this.weekGrid) this.currentDate = this.weekGrid.getCurrentDate();
		this.updatePeriodDisplay();
	}

	// ------------------------------------------------------------------
	// Live capture footer
	// ------------------------------------------------------------------

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

	private renderLiveFooter(container: HTMLElement) {
		const footer = container.createDiv({ cls: "tt-combined-footer" });

		// Row 1: input + primary backfill action
		const capture = footer.createDiv({ cls: "tt-combined-capture" });

		this.taskInputEl = capture.createEl("input", {
			cls: "tt-task-input tt-combined-input",
			type: "text",
			placeholder: "What were you working on?",
		});
		this.taskInputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.handleBackfillSinceLast();
			}
		});

		const sinceLastBtn = capture.createEl("button", {
			cls: "tt-timer-btn tt-backfill-btn",
			text: "Since last entry ↵",
		});
		sinceLastBtn.setAttribute(
			"aria-label",
			"Create entry from end of most recent entry today to now (default 30m if none)"
		);
		sinceLastBtn.addEventListener("click", () => this.handleBackfillSinceLast());

		// Row 2: timer + quick offsets + today total
		const actions = footer.createDiv({ cls: "tt-combined-actions" });

		// Timer cluster
		const timerCluster = actions.createDiv({ cls: "tt-combined-timer" });
		this.timerDisplayEl = timerCluster.createDiv({ cls: "tt-timer-time tt-combined-timer-time", text: "00:00" });
		this.timerStatusEl = timerCluster.createDiv({ cls: "tt-timer-status", text: "Ready" });

		const timerCtrls = actions.createDiv({ cls: "tt-timer-controls tt-combined-timer-controls" });
		this.startBtnEl = timerCtrls.createEl("button", { cls: "tt-timer-btn tt-timer-btn-start", text: "Start" });
		this.startBtnEl.addEventListener("click", () => this.handleStart());

		this.stopBtnEl = timerCtrls.createEl("button", { cls: "tt-timer-btn tt-timer-btn-stop", text: "Stop" });
		this.stopBtnEl.style.display = "none";
		this.stopBtnEl.addEventListener("click", () => this.handleStop());

		this.pomodoroBtnEl = timerCtrls.createEl("button", { cls: "tt-timer-btn tt-timer-btn-pomodoro", text: "🍅" });
		this.pomodoroBtnEl.setAttribute("aria-label", "Toggle pomodoro mode");
		this.pomodoroBtnEl.addEventListener("click", () => this.togglePomodoroMode());

		this.pomodoroDotsEl = timerCtrls.createDiv({ cls: "tt-pomodoro-counter tt-combined-dots" });
		this.pomodoroDotsEl.style.display = "none";
		this.updatePomodoroDots();

		// Quick offset cluster
		const offsetCluster = actions.createDiv({ cls: "tt-offset-cluster" });
		offsetCluster.createDiv({ cls: "tt-offset-label", text: "Started X min ago:" });
		this.offsetButtonsEl = offsetCluster.createDiv({ cls: "tt-offset-buttons" });
		this.renderOffsetButtons();

		// Today total
		const todayCluster = actions.createDiv({ cls: "tt-combined-today" });
		this.todayTotalEl = todayCluster.createDiv({ cls: "tt-today-total tt-combined-today-total", text: "0h 0m" });
		todayCluster.createDiv({ cls: "tt-today-label", text: "Today" });
	}

	private renderOffsetButtons() {
		if (!this.offsetButtonsEl) return;
		this.offsetButtonsEl.empty();
		this.plugin.settings.quickOffsets.forEach((minutes) => {
			const btn = this.offsetButtonsEl!.createEl("button", {
				cls: "tt-offset-btn",
				text: `${minutes}`,
			});
			btn.addEventListener("click", () => this.handleQuickOffset(minutes));
		});
	}

	// ------------------------------------------------------------------
	// Backfill: "Since last entry"
	// ------------------------------------------------------------------

	private async handleBackfillSinceLast() {
		const now = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();
		let endMin = Math.ceil(nowMin / 15) * 15;
		if (endMin > MAX_END_MINUTES) endMin = MAX_END_MINUTES;

		const today = getToday();
		const todayEntries = this.plugin.storage.getEntriesForDate(today);

		// Last entry today that ended before "now" (rounded)
		const lastEnd = todayEntries
			.map((e) => parseTimeToMinutes(e.endTime))
			.filter((m) => m <= endMin)
			.sort((a, b) => b - a)[0];

		let startMin: number;
		if (lastEnd !== undefined) {
			startMin = lastEnd;
		} else {
			startMin = Math.floor((nowMin - DEFAULT_BACKFILL_MINUTES) / 15) * 15;
			if (startMin < 0) startMin = 0;
		}

		if (startMin >= endMin) {
			// Last entry already covers up to or past "now" — bump end by one slot
			endMin = Math.min(startMin + 15, MAX_END_MINUTES);
			if (endMin <= startMin) return; // can't extend, give up silently
		}

		const description = this.taskInputEl?.value?.trim() || "";
		const tags = this.extractTags(description);

		const entry = await this.plugin.storage.addEntry({
			date: today,
			startTime: minutesToTime(startMin),
			endTime: minutesToTime(endMin),
			description: description.replace(/#\w+/g, "").trim(),
			tags,
			isPomodoro: false,
			isBreak: false,
		});

		if (this.taskInputEl) this.taskInputEl.value = "";

		// Render the new entry on the grid first (so it stays visible if user
		// cancels the editor), then open the inline editor on top. openEditor-
		// ForEntry snaps the viewport to today if today isn't in view.
		await this.weekGrid?.render();
		this.updatePeriodDisplay();
		await this.weekGrid?.openEditorForEntry(entry.id);

		await this.updateTodayStats();
	}

	// ------------------------------------------------------------------
	// Stopwatch / pomodoro (lifted from LiveCaptureView)
	// ------------------------------------------------------------------

	private async updateTodayStats() {
		await this.plugin.storage.loadEntries();
		const totalMinutes = this.plugin.storage.getTotalMinutesForDate(getToday());
		if (this.todayTotalEl) this.todayTotalEl.textContent = formatDuration(totalMinutes);
	}

	private handleTimerTick(remaining: number, mode: TimerMode) {
		if (this.timerDisplayEl) {
			this.timerDisplayEl.textContent = this.timer?.getFormattedTime() || "00:00";
		}
	}

	private async handleTimerComplete(mode: TimerMode, startTime: Date, endTime: Date) {
		if (this.plugin.settings.soundEnabled) {
			if (mode === "work") playTimerComplete();
			else playBreakComplete();
		}
		if (this.plugin.settings.notificationsEnabled) {
			if (mode === "work") showNotification("Pomodoro Complete! 🍅", "Time for a break.");
			else showNotification("Break Over!", "Ready to start another pomodoro?");
		}
		if (mode === "work") {
			const description = this.taskInputEl?.value || "Pomodoro session";
			await this.createEntry(startTime, endTime, description, true);
		} else {
			await this.createEntry(startTime, endTime, "Break", false, true);
		}
		this.updateTimerUI();
		this.updatePomodoroDots();
		await this.updateTodayStats();
	}

	private handleStart() {
		if (this.isPomodoroMode) {
			this.timer?.start();
		} else {
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
			if (startTime) await this.createEntry(startTime, new Date(), description, true);
			this.timer?.stop();
		} else {
			if (this.stopwatchInterval) {
				clearInterval(this.stopwatchInterval);
				this.stopwatchInterval = null;
			}
			if (this.stopwatchStart) {
				await this.createEntry(this.stopwatchStart, new Date(), description, false);
				this.stopwatchStart = null;
			}
			this.stopwatchElapsed = 0;
			if (this.timerDisplayEl) this.timerDisplayEl.textContent = "00:00";
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
			if (this.isPomodoroMode) this.pomodoroBtnEl.classList.add("tt-active");
			else this.pomodoroBtnEl.classList.remove("tt-active");
		}
		if (this.pomodoroDotsEl) {
			this.pomodoroDotsEl.style.display = this.isPomodoroMode ? "flex" : "none";
		}
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

		if (this.startBtnEl) this.startBtnEl.style.display = isRunning ? "none" : "inline-block";
		if (this.stopBtnEl) this.stopBtnEl.style.display = isRunning ? "inline-block" : "none";

		if (this.timerStatusEl) {
			if (isRunning) {
				this.timerStatusEl.textContent = this.isPomodoroMode
					? `${this.timer?.getMode() === "work" ? "Working" : "Break"}`
					: "Tracking…";
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
			if (i < completed) dot.classList.add("tt-completed");
		}
	}

	private extractTags(description: string): string[] {
		const matches = description.match(/#\w+/g);
		return matches ? matches.map((t) => t.slice(1)) : [];
	}

	private async createEntry(
		startTime: Date,
		endTime: Date,
		description: string,
		isPomodoro: boolean,
		isBreak: boolean = false
	) {
		const tags = this.extractTags(description);
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
		if (this.timer) {
			this.timer.updateOptions({
				workMinutes: this.plugin.settings.pomodoroWorkMinutes,
				breakMinutes: this.plugin.settings.pomodoroBreakMinutes,
				longBreakMinutes: this.plugin.settings.pomodoroLongBreakMinutes,
				pomodorosBeforeLongBreak: this.plugin.settings.pomodorosBeforeLongBreak,
			});
		}
		this.renderOffsetButtons();
		this.updateTodayStats();
		this.updatePomodoroDots();
		this.weekGrid?.render();
	}

	async onClose() {
		if (this.stopwatchInterval) clearInterval(this.stopwatchInterval);
		this.weekGrid?.destroy();
		if (this.storageListener) {
			this.plugin.storage.removeListener(this.storageListener);
			this.storageListener = null;
		}
	}
}
