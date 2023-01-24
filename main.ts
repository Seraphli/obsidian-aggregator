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
import { AggregatorArgs, Result } from "dataclass";
import { CURFILE, SELFBLOCK, FIELDS, ORDERS } from "./constants";
import * as Handlebars from "handlebars";
import * as _ from "lodash";

function checkOrder(fields: string[], orders: string[]) {
	if (fields.length != orders.length)
		return { flag: false, msg: "length of fields and orders must match" };
	if (!fields.every((val) => FIELDS.includes(val)))
		return { flag: false, msg: `fields must in ${FIELDS}` };
	if (!orders.every((val) => ORDERS.includes(val)))
		return { flag: false, msg: `orders must in ${ORDERS}` };
	return { flag: true, msg: "" };
}

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
				if (this.settings.debug) {
					console.log("Aggregator: args", args);
				}

				// Handle arguments
				let argsMatches: {
					regex: RegExp;
					template: HandlebarsTemplateDelegate;
				}[] = [];
				let argsOrders: {
					fields: string[];
					orders: string[];
				} = { fields: [], orders: [] };
				try {
					for (const m of args.matches) {
						const regex = new RegExp(m.regex, "gm");
						const template = Handlebars.compile(m.template, {
							noEscape: true,
						});
						argsMatches.push({ regex, template });
					}
					if (args.order) {
						argsOrders.fields = args.order.fields
							.split(",")
							.map((val) => val.trim());
						argsOrders.orders = args.order.orders
							.split(",")
							.map((val) => val.trim());
						const res = checkOrder(
							argsOrders.fields,
							argsOrders.orders
						);
						if (!res.flag) throw Error(res.msg);
					}
				} catch (error) {
					await this.renderMarkdown(
						`**Error**: Arguments parse error.\n${error}`,
						el,
						ctx
					);
					console.log("Aggregator", error);
					return;
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
					mdFiles.forEach((val) => {
						const scopeMatches = partRegex.filter((regex) => {
							const m = val.path.match(regex);
							if (m == null || m.length == 0) {
								return false;
							}
							return true;
						});
						if (scopeMatches.length > 0) {
							allMDFile.push(val);
						}
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

				// Collect results
				let results: Result[] = [];
				for (const file of allMDFile) {
					if (results.length > this.settings.limitResult) break;
					// Read file content
					let content = await this.app.vault.cachedRead(file);
					content = content.replace(SELFBLOCK, "");
					if (this.settings.excludedRegex != "") {
						content = content.replace(
							new RegExp(this.settings.excludedRegex),
							""
						);
					}
					for (const m of argsMatches) {
						if (results.length > this.settings.limitResult) break;
						let matches = content.matchAll(m.regex);
						for (let match of matches) {
							if (results.length > this.settings.limitResult)
								break;
							if (this.settings.debug) {
								console.log(
									`Aggregator: Find match in ${file.path}. ${match[0]}`
								);
							}

							let substringStartToMatch = content.substring(
								0,
								match.index
							);
							let lines = substringStartToMatch.split("\n");
							let numberOfLines = lines.length;
							let numberOfChars = lines[lines.length - 1].length;
							let template = m.template({ match });

							let result: Result = {
								path: file.path,
								filename: file.basename + file.extension,
								basename: file.basename,
								extension: file.extension,
								ctime: file.stat.ctime,
								mtime: file.stat.mtime,
								match: match[0],
								index: match.index ? match.index : -1,
								line: numberOfLines,
								ch: numberOfChars,
								template: template,
							};
							results.push(result);
						}
					}
				}

				// Sort
				if (argsOrders.fields.length > 0) {
					results = _.orderBy(
						results,
						argsOrders.fields,
						// @ts-ignore
						argsOrders.orders
					);
				} else {
					if (this.settings.defaultFields.length > 0) {
						const fields = this.settings.defaultFields
							.split(",")
							.map((val) => val.trim());
						const orders = this.settings.defaultOrders
							.split(",")
							.map((val) => val.trim());
						const res = checkOrder(fields, orders);
						if (res.flag) {
							results = _.orderBy(
								results,
								fields,
								// @ts-ignore
								orders
							);
						} else {
							results = _.orderBy(
								results,
								["ctime", "line"],
								["asc", "asc"]
							);
						}
					} else {
						results = _.orderBy(
							results,
							["ctime", "line"],
							["asc", "asc"]
						);
					}
				}
				if (this.settings.debug) {
					console.log("Aggregator: results", results);
				}

				// Create summary
				let summaries: string[] = [];
				results.forEach((result) => {
					let summary = result.template;
					if (this.settings.fileLink) {
						if (
							!(
								result.path == ctx.sourcePath &&
								this.settings.noCurFile
							)
						) {
							summary =
								Handlebars.compile(this.settings.fileIndecator)(
									{
										result: result,
										index: summaries.length + 1,
									}
								) + summary;
						}
					}
					summaries.push(summary);
				});
				if (this.settings.debug) {
					console.log("Aggregator: summaries", summaries);
				}

				await this.renderMarkdown(
					summaries.join(this.settings.joinString),
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
