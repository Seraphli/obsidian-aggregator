import {
	Plugin,
	parseYaml,
	TFile,
	MarkdownRenderer,
	MarkdownPostProcessorContext,
} from "obsidian";
import {
	AggregatorSettings,
	DEFAULT_SETTINGS,
	AggregatorSettingTab,
} from "settings";
import { AggregatorArgs } from "dataclass";
import { CURFILE } from "./constants";
import * as Handlebars from "handlebars";

export default class Aggregator extends Plugin {
	settings: AggregatorSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(
			"aggregator",
			async (source, el, ctx) => {
				// Check tab
				source = source.trim();
				const tabMatch = source.match(/\t/gm);
				if (tabMatch != null && tabMatch.length > 0) {
					await this.renderMarkdown(
						"**Error**: Don't use tab to indent. Replace tab with spaces.",
						el,
						ctx
					);
					return;
				}

				// Parse yaml
				let args;
				try {
					args = parseYaml(source) as AggregatorArgs;
				} catch (error) {
					await this.renderMarkdown(
						`**Error**: Yaml parse error.\n${error}`,
						el,
						ctx
					);
					console.log("Aggregator", error);
					return;
				}

				// Handle arguments
				let argsMatches: {
					regex: RegExp;
					template: HandlebarsTemplateDelegate;
				}[] = [];
				try {
					for (const m of args.matches) {
						const regex = new RegExp(m.regex, "gm");
						const template = Handlebars.compile(m.template, {
							noEscape: true,
						});
						argsMatches.push({ regex, template });
					}
				} catch (error) {
					await this.renderMarkdown(
						`**Error**: Arguments parse error.\n${error}`,
						el,
						ctx
					);
					console.log("Aggregator", error);
				}
				if (argsMatches.length == 0) return;
				if (this.settings.debug) {
					console.log("Aggregator: argsMatches", argsMatches);
				}

				// Filter files
				const allMDFile: TFile[] = [];
				const partRegexFile: string[] = [];
				args.scope.forEach((val) => {
					if (val == CURFILE) {
						const file = this.app.vault.getAbstractFileByPath(
							ctx.sourcePath
						);
						if (file instanceof TFile) {
							allMDFile.push(file);
						}
					} else {
						const file = this.app.vault.getAbstractFileByPath(val);
						if (file instanceof TFile) {
							allMDFile.push(file);
						} else {
							partRegexFile.push(val);
						}
					}
				});
				if (partRegexFile.length > 0) {
					const partRegex: RegExp[] = [];
					partRegexFile.forEach((val) => {
						partRegex.push(new RegExp(val, "g"));
					});
					let mdFiles = this.app.vault.getMarkdownFiles();
					mdFiles = mdFiles.filter((val) => {
						const scopeMatches = partRegex.filter((regex) => {
							const m = val.path.match(regex);
							if (m == null || m.length == 0) {
								return false;
							}
							return true;
						});
						if (scopeMatches.length > 0) {
							return true;
						}
						return false;
					});
				}
				if (allMDFile.length == 0) return;
				if (this.settings.debug) {
					const files: string[] = [];
					for (const file of allMDFile) {
						files.push(file.path);
					}
					console.log("Aggregator: files", files.join("\n"));
				}

				// Read file content
				let fileContents: { file: TFile; content: string }[] = [];
				for (const file of allMDFile) {
					const content = await this.app.vault.cachedRead(file);
					fileContents.push({ file, content });
				}

				// Create summary
				let summary: string[] = [];
				const selfBlock = /```aggregator[\S\s]*?```/gm;
				fileContents.forEach((item) => {
					if (summary.length > this.settings.limitResult) return;
					let content = item.content.replace(selfBlock, "");
					if (this.settings.excludedRegex != "") {
						content = content.replace(
							new RegExp(this.settings.excludedRegex),
							""
						);
					}
					for (const m of argsMatches) {
						let matches = content.matchAll(m.regex);
						for (let match of matches) {
							if (this.settings.debug) {
								console.log(
									`Aggregator: Find ${summary.length}th match in ${item.file.path}. ${match[0]}`
								);
							}
							let result = m.template({ match });
							if (this.settings.fileLink) {
								if (
									this.settings.noCurFile &&
									item.file.path != ctx.sourcePath
								) {
									result =
										Handlebars.compile(
											this.settings.fileIndecator
										)({
											file: item.file,
											index: summary.length + 1,
										}) + result;
								}
							}
							if (summary.length > this.settings.limitResult)
								return;
							summary.push(result);
						}
					}
				});
				await this.renderMarkdown(
					summary.join(this.settings.joinString),
					el,
					ctx
				);
			}
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AggregatorSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async renderMarkdown(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		let summaryContainer = createEl("div");
		await MarkdownRenderer.renderMarkdown(
			source,
			summaryContainer,
			ctx.sourcePath,
			this
		);
		el.replaceWith(summaryContainer);
	}
}
