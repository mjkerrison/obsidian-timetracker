import { Plugin, WorkspaceLeaf } from "obsidian";
import { TimeTrackerSettingTab } from "./settings";
import { TimeTrackerStorage } from "./storage";
import { WeekView } from "./views/WeekView";
import { LiveCaptureView } from "./views/LiveCaptureView";
import { CombinedView } from "./views/CombinedView";
import {
	TimeTrackerSettings,
	DEFAULT_SETTINGS,
	VIEW_TYPE_WEEK,
	VIEW_TYPE_LIVE,
	VIEW_TYPE_COMBINED,
} from "./types";

export default class TimeTrackerPlugin extends Plugin {
	settings: TimeTrackerSettings;
	storage: TimeTrackerStorage;

	async onload() {
		await this.loadSettings();

		this.storage = new TimeTrackerStorage(this.app, this.settings);

		this.registerView(VIEW_TYPE_COMBINED, (leaf) => new CombinedView(leaf, this));
		// Old views kept registered as fallback for any saved workspace state
		this.registerView(VIEW_TYPE_WEEK, (leaf) => new WeekView(leaf, this));
		this.registerView(VIEW_TYPE_LIVE, (leaf) => new LiveCaptureView(leaf, this));

		this.addRibbonIcon("calendar-clock", "Time Tracker", () => {
			this.activateView(VIEW_TYPE_COMBINED);
		});

		this.addCommand({
			id: "open-time-tracker",
			name: "Open Time Tracker",
			callback: () => this.activateView(VIEW_TYPE_COMBINED),
		});

		this.addCommand({
			id: "open-week-view",
			name: "Open Week View (standalone)",
			callback: () => this.activateView(VIEW_TYPE_WEEK),
		});

		this.addCommand({
			id: "open-live-capture",
			name: "Open Live Capture (standalone)",
			callback: () => this.activateView(VIEW_TYPE_LIVE),
		});

		this.addSettingTab(new TimeTrackerSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_COMBINED);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_WEEK);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_LIVE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.storage) {
			this.storage.updateSettings(this.settings);
		}
	}

	async activateView(viewType: string) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(viewType);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: viewType, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	refreshViews() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_COMBINED).forEach((leaf) => {
			if (leaf.view instanceof CombinedView) {
				leaf.view.refresh();
			}
		});
		this.app.workspace.getLeavesOfType(VIEW_TYPE_WEEK).forEach((leaf) => {
			if (leaf.view instanceof WeekView) {
				leaf.view.refresh();
			}
		});
		this.app.workspace.getLeavesOfType(VIEW_TYPE_LIVE).forEach((leaf) => {
			if (leaf.view instanceof LiveCaptureView) {
				leaf.view.refresh();
			}
		});
	}
}
