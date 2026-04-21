#!/usr/bin/env bash

###
# Wrapper script to run a smpling of title/summary generation across plans 
###

STYLE_HINT="Be creative and dramatic."

node ./s2.js 0 19 "$STYLE_HINT"
mv titles.jsonl t1

node ./s2.js 10000 10019 "$STYLE_HINT"
mv titles.jsonl t2

node ./s2.js 20000 20019 "$STYLE_HINT"
mv titles.jsonl t3

node ./s2.js 30000 30019 "$STYLE_HINT"
mv titles.jsonl t4


echo "Concat results"
rm script_out.jsonl
cat t1 t2 t3 t4 >> script_out.jsonl
rm t1 t2 t3 t4
