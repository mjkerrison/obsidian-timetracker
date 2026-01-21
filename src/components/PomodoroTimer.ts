import { formatSeconds } from "../utils/time";

export type TimerState = "idle" | "running" | "paused";
export type TimerMode = "work" | "break" | "longBreak";

export interface PomodoroTimerOptions {
	workMinutes: number;
	breakMinutes: number;
	longBreakMinutes: number;
	pomodorosBeforeLongBreak: number;
	onTick: (remainingSeconds: number, mode: TimerMode) => void;
	onComplete: (mode: TimerMode, startTime: Date, endTime: Date) => void;
}

export class PomodoroTimer {
	private options: PomodoroTimerOptions;
	private state: TimerState = "idle";
	private mode: TimerMode = "work";
	private remainingSeconds: number = 0;
	private startTime: Date | null = null;
	private intervalId: number | null = null;
	private completedPomodoros: number = 0;

	constructor(options: PomodoroTimerOptions) {
		this.options = options;
		this.remainingSeconds = options.workMinutes * 60;
	}

	updateOptions(options: Partial<PomodoroTimerOptions>) {
		this.options = { ...this.options, ...options };
		if (this.state === "idle") {
			this.remainingSeconds = this.getDurationForMode(this.mode);
		}
	}

	private getDurationForMode(mode: TimerMode): number {
		switch (mode) {
			case "work":
				return this.options.workMinutes * 60;
			case "break":
				return this.options.breakMinutes * 60;
			case "longBreak":
				return this.options.longBreakMinutes * 60;
		}
	}

	start() {
		if (this.state === "running") return;

		this.state = "running";
		this.startTime = new Date();

		// If resuming from paused, adjust start time
		if (this.remainingSeconds < this.getDurationForMode(this.mode)) {
			const elapsedSeconds = this.getDurationForMode(this.mode) - this.remainingSeconds;
			this.startTime = new Date(Date.now() - elapsedSeconds * 1000);
		}

		this.intervalId = window.setInterval(() => this.tick(), 1000);
	}

	pause() {
		if (this.state !== "running") return;

		this.state = "paused";
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	stop() {
		this.state = "idle";
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.mode = "work";
		this.remainingSeconds = this.getDurationForMode("work");
		this.startTime = null;
	}

	reset() {
		this.stop();
		this.completedPomodoros = 0;
	}

	private tick() {
		this.remainingSeconds--;
		this.options.onTick(this.remainingSeconds, this.mode);

		if (this.remainingSeconds <= 0) {
			this.complete();
		}
	}

	private complete() {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		const endTime = new Date();

		// Call completion handler
		this.options.onComplete(this.mode, this.startTime!, endTime);

		// Handle mode transitions
		if (this.mode === "work") {
			this.completedPomodoros++;

			// Check if time for long break
			if (this.completedPomodoros >= this.options.pomodorosBeforeLongBreak) {
				this.mode = "longBreak";
				this.completedPomodoros = 0;
			} else {
				this.mode = "break";
			}
		} else {
			// After break, go back to work
			this.mode = "work";
		}

		this.remainingSeconds = this.getDurationForMode(this.mode);
		this.state = "idle";
		this.startTime = null;
	}

	getState(): TimerState {
		return this.state;
	}

	getMode(): TimerMode {
		return this.mode;
	}

	getRemainingSeconds(): number {
		return this.remainingSeconds;
	}

	getCompletedPomodoros(): number {
		return this.completedPomodoros;
	}

	getStartTime(): Date | null {
		return this.startTime;
	}

	setStartTimeOffset(minutesAgo: number) {
		if (this.state === "running" && this.startTime) {
			this.startTime = new Date(Date.now() - minutesAgo * 60 * 1000);
		}
	}

	getFormattedTime(): string {
		return formatSeconds(this.remainingSeconds);
	}
}
