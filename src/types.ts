export interface TimeEntry {
	id: string;
	date: string; // YYYY-MM-DD
	startTime: string; // HH:MM
	endTime: string; // HH:MM
	description: string;
	tags: string[];
	isPomodoro: boolean;
	isBreak: boolean;
}

export interface TimeTrackerSettings {
	filePath: string;
	weekStartDay: 0 | 1; // 0 = Sunday, 1 = Monday
	pomodoroWorkMinutes: number;
	pomodoroBreakMinutes: number;
	pomodoroLongBreakMinutes: number;
	pomodorosBeforeLongBreak: number;
	soundEnabled: boolean;
	notificationsEnabled: boolean;
	quickOffsets: number[];
}

export const DEFAULT_SETTINGS: TimeTrackerSettings = {
	filePath: "time-tracking.md",
	weekStartDay: 1,
	pomodoroWorkMinutes: 25,
	pomodoroBreakMinutes: 5,
	pomodoroLongBreakMinutes: 15,
	pomodorosBeforeLongBreak: 4,
	soundEnabled: true,
	notificationsEnabled: true,
	quickOffsets: [5, 10, 15, 30],
};

export const VIEW_TYPE_WEEK = "time-tracker-week-view";
export const VIEW_TYPE_LIVE = "time-tracker-live-view";
