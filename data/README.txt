Place PDF files in this folder, then run:

  npm run corpus:prepare

Optional evaluation set:

  eval-questions.csv

Columns:
  Question, Source Docs, Answerable, Expected Keywords, Answer

Example Source Docs value: *DPM* or *RegsNavy*

Run evaluation:

  npm run eval
  npm run eval -- --llm

See EVALUATION.md for metrics and results.
