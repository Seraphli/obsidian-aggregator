# Argument Explain

Arguments should be written in YAML.

The dataclass is defined in [dataclass.ts](../dataclass.ts)

## Processing Pipeline

1. Search files in the vault based on the `scope` argument.
2. Search the content in the files based on the `matches` argument.
3. Sort the results based on the `order` argument.
4. Render the summary based on the `template` argument.
5. Render the summary based on the `fileIndecator` argument.
6. Concatenate the results based on the `joinString` argument.
7. Decorate the summary based on the `decorator` argument.

## Support Arguments

```typescript
export class AggregatorArgs {
	scope: string[];
	matches: Match[];
	order: Order;
	fileIndecator: string;
	joinString: string;
	decorator: string;
	limitSearch: number;
	limitDisplay: number;
	fileLink: boolean;
	noCurFile: boolean;
}
```

## Dataclass

Introduce `Result` dataclass, which will be used in the template.

```typescript
export class Result {
	index: number;
	path: string;
	filename: string;
	basename: string;
	extension: string;
	ctime: number;
	mtime: number;
	match: RegExpMatchArray;
	matchIndex: number;
	line: number;
	ch: number;
	content: string;
	template: HandlebarsTemplateDelegate;
	register: Register;
}
```

`Register` can be used to store any data.

```typescript
export class Register {
	s: string;
	n: number;
	b: boolean;
}
```

## scope

**scope:** (list of Regular expressions) Define the search scope, which can be folder name, file name or the file path in the vault. `Current File` is a reserved keyword.

Note: For better performance in a large vault, you should consider using the exact file path instead of a regular expression to avoid searching the whole vault.

Example:

```yaml
scope:
    - ReadingNotes/
    - Current File
```

Search in the current file and the `ReadingNotes` folder.

## matches

**matches:** (list of matches)

**match**

-   regex: Regular expression.
-   template: Handlebars template.

Example:

```yaml
matches:
    - regex: '^\w[^\#]*\#[a-zA-Z0-9\_]+\s*$'
      template: '{{{result.match.[0]}}}'
    - regex: '>%%\n>```annotation-json\n>.*\n>```\n>%%\n>\*%%PREFIX%%.*\n>%%LINK%%.*\n>%%COMMENT%%\n>.*\n>%%TAGS%%\n>\#[a-zA-Z0-9\_]+\n\^[a-zA-Z0-9]*'
      template: '{{{result.match.[0]}}}'
```

Valid input(data) for `eval`:

```js
let data: {
	result: Result;
	summaries: string[];
	register: Register;
}
```

- result(Result): result data
- summaries(list of string): the list before being concatenatd
- register(Register): global register


## order

**order**: (fields and orders) Define the fields you want to sort by and the direction you want, separated by commas. When not present, the plugin will first check the default fields and orders in the setting. If the setting is not valid, the plugin will sort the results by the creating time and the line number.

Valid fields: path, filename, basename, extension, ctime, mtime, match, index, line, ch, content

Valid orders: asc, desc

Example:

```yaml
order:
    fields: filename, line
    orders: asc, asc
```

Sort the results by file name and line in ascending order.

## decorator

Handlebars template that decorates the whole summary.

Example:

```yaml
decorator: "| ID  | Note | ModifyTime | Done        |\n| --- | ---- | ---------- | ----------- |\n{{templates}}"
```
Wrap the summary with table heading.

Valid input(data) for `eval`:

```js
let data: {
	templates: string;
	summaries: string[];
	register: Register;
}
```

- templates(string): concatenated string
- summaries(list of string): the list before being concatenatd
- register(Register): global register


## fileIndecator

The leading template that provides other information like file path.

Example:

```yaml
fileIndecator: >-
  |{{index}}|[[{{result.basename}}]]|{{eval "return moment.unix(data.result.mtime/1000).format('YYYY-MM-DD')"}}|{{template}}|
```

Valid input(data) for `eval`:

```js
let data: {
	result: Result;
	summaries: string[];
	register: Register;
	template: string;
}
```

- result(Result): result data
- summaries(list of string): the list before being concatenatd
- template(string): each summary
- register(Register): global register

## Other Arguments

Other arguments like `joinString`, `limitSearch`, `limitDisplay`, `fileLink`, `noCurFile` have the same effect as the value in the setting. They are used to override the default settings.

## Advanced

Handlebars template supports custom helper `eval`. You can process the `data` argument with any javascript code. So you can render different contents based on some conditions. Checkout [Example3](Example3.md) for more information.
