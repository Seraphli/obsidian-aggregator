# Obsidian Aggregator

This plugin helps you gather information from files, and make a summary in the file.

Although it is difficult to write the regular expression, once it's done, it will help you a lot.

## Usage

Create a code block like this, and set the language to the `aggregator`. Then this plugin will find content based on RegExp and render the result with the template.

````aggregator
scope:
    - Current File
matches:
    - regex: '>%%\n>```annotation-json\n>.*\n>```\n>%%\n>\*%%PREFIX%%.*\n>%%LINK%%.*\n>%%COMMENT%%\n>.*\n>%%TAGS%%\n>\#[a-zA-Z0-9\_]+\n\^[a-zA-Z0-9]*'
      template: '{{{match.[0]}}}'
````

### Argument Explain

Arguments should be written in YAML.

**scope:** (list of strings) Define the search scope, which can be folder name, file name or the file path in the vault. `Current File` is a reserved keyword.

**matches:** (list of matches)

**match**

-   regex: Regular expression.
-   template: Handlebars template. Available data: `match`, type: `RegExpMatchArray`.

## Example Usage

### Example 1 Explain

This example shows how to aggregate blocks with tags in the current file.

### Example 2 Explain

This example shows how to aggregate blocks with tags in the current file. The regex is designed for [obsidian-annotator](https://github.com/elias-sundqvist/obsidian-annotator).

## Settings

Note the default join string is not empty. It's just the text area can not display `\n\n`.
