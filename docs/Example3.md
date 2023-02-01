Aggregator Stats Table
```aggregator
scope:
    - ReadingNotes/
matches:
    - regex: '[\S\s]+'
      template: >-
        {{eval "return data.result.content.contains('#summary')? '✓': 'x'"}}
order:
    fields: mtime
    orders: desc
fileIndecator: >-
    |{{result.index}}|[[{{result.basename}}]]|{{eval "return moment.unix(data.result.mtime/1000).format('YYYY-MM-DD')"}}|{{template}}|
joinString: "\n"
decorator: |-
    Notes: {{eval "return (data.templates.match(/✓/g)).length"}}/{{eval "return data.summaries.length"}}
    
    | ID  | Note | ModifyTime | Done        |
    | --- | ---- | ---------- | ----------- |
    {{templates}}
```
