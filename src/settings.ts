import { App, PluginSettingTab, Setting } from "obsidian";
import type TimeTrackerPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class TimeTrackerSettingTab extends PluginSettingTab {
	plugin: TimeTrackerPlugin;

	constructor(app: App, plugin: TimeTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Time Tracker Settings" });

		new Setting(containerEl)
			.setName("Data file path")
			.setDesc("Path to the markdown file storing time entries")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.filePath)
					.setValue(this.plugin.settings.filePath)
					.onChange(async (value) => {
						this.plugin.settings.filePath = value || DEFAULT_SETTINGS.filePath;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Week starts on")
			.setDesc("First day of the week in the calendar view")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("1", "Monday")
					.addOption("0", "Sunday")
					.setValue(String(this.plugin.settings.weekStartDay))
					.onChange(async (value) => {
						this.plugin.settings.weekStartDay = parseInt(value) as 0 | 1;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Working hours start")
			.setDesc("Start of working hours (shaded on weekdays)")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.workingHoursStart)
					.setValue(this.plugin.settings.workingHoursStart)
					.onChange(async (value) => {
						if (/^\d{2}:\d{2}$/.test(value)) {
							this.plugin.settings.workingHoursStart = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						}
					})
			);

		new Setting(containerEl)
			.setName("Working hours end")
			.setDesc("End of working hours (shaded on weekdays)")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.workingHoursEnd)
					.setValue(this.plugin.settings.workingHoursEnd)
					.onChange(async (value) => {
						if (/^\d{2}:\d{2}$/.test(value)) {
							this.plugin.settings.workingHoursEnd = value;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						}
					})
			);

		containerEl.createEl("h3", { text: "Pomodoro Settings" });

		new Setting(containerEl)
			.setName("Work duration (minutes)")
			.setDesc("Length of a pomodoro work session")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.pomodoroWorkMinutes))
					.setValue(String(this.plugin.settings.pomodoroWorkMinutes))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.pomodoroWorkMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Short break duration (minutes)")
			.setDesc("Length of a short break between pomodoros")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.pomodoroBreakMinutes))
					.setValue(String(this.plugin.settings.pomodoroBreakMinutes))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.pomodoroBreakMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Long break duration (minutes)")
			.setDesc("Length of a long break after completing a set of pomodoros")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.pomodoroLongBreakMinutes))
					.setValue(String(this.plugin.settings.pomodoroLongBreakMinutes))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.pomodoroLongBreakMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Pomodoros before long break")
			.setDesc("Number of work sessions before taking a long break")
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.pomodorosBeforeLongBreak))
					.setValue(String(this.plugin.settings.pomodorosBeforeLongBreak))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.pomodorosBeforeLongBreak = num;
							await this.plugin.saveSettings();
						}
					})
			);

		containerEl.createEl("h3", { text: "Notifications" });

		new Setting(containerEl)
			.setName("Enable sound")
			.setDesc("Play a sound when timer completes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundEnabled)
					.onChange(async (value) => {
						this.plugin.settings.soundEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable system notifications")
			.setDesc("Show a system notification when timer completes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.notificationsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.notificationsEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Quick Offset Buttons" });

		new Setting(containerEl)
			.setName("Quick offsets (minutes)")
			.setDesc("Comma-separated list of offset minutes for quick start buttons")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.quickOffsets.join(", "))
					.setValue(this.plugin.settings.quickOffsets.join(", "))
					.onChange(async (value) => {
						const offsets = value
							.split(",")
							.map((s) => parseInt(s.trim()))
							.filter((n) => !isNaN(n) && n > 0);
						if (offsets.length > 0) {
							this.plugin.settings.quickOffsets = offsets;
							await this.plugin.saveSettings();
							this.plugin.refreshViews();
						}
					})
			);
	}
}
