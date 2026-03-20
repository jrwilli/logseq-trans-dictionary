# Logseq Translation/Dictionary

Create translated pages in [target language] from [source language] blocks

Initially created to enhance an Italian language learning graph, this plugin has a heavy lean to the English speaker learning Italian (e.g. me).

![demo](./public/demo.gif)

## Installation

- Download a released version assets from Github.
- Unzip it.
- Click Load unpacked plugin, and select destination directory to the unzipped folder.

## Usage

- Type `/Translate` or select 'Translate' from the block context menu for blocks containing the source language
- A new page will be created from the block content
- Any <source language> word or phrase → page with translation - for single words, you also get: part of speech, gender, definitions, examples, space for your own notes
- Italian Infinitive Verbs → additionally get a full conjugation section with correctly structured tables
- Handles capitalisation, page tags, accented characters
- Degrades gracefully when Wiktionary has nothing

Requires a Google Translate API Key for phrases to be translated.
Verb conjugations only available in IT in this version

## Settings

- Source language: language code of the word/phrase to lookup (default: it)
- Target language: language code to translate into (default: en)
- Google Translate API key: Your Google Cloud Translate API key

## Development

1. yarn
2. yarn build
3. Load the unpacked plugin

## Thanks

@trashhalo for the original logseq-dictionary plugin, which gave me the idea and the foundation
https://www.reddit.com/user/IlliniToffee/ for creating and sharing the Italian Verb Dictionary spreadsheet used to drive the verb conjugations https://www.reddit.com/r/italianlearning/comments/1aw2itb/verb_conjugation_spreadsheet/
