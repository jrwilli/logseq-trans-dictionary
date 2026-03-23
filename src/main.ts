import "@logseq/libs";
import type { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin";

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "sourceLang",
    type: "string",
    title: "Source language",
    description: "Language code of the word you are looking up (e.g. it, fr, de)",
    default: "it",
  },
  {
    key: "targetLang",
    type: "string",
    title: "Target language",
    description: "Language code to translate into (e.g. en)",
    default: "en",
  },
  {
    key: "googleApiKey",
    type: "string",
    title: "Google Translate API key",
    description: "Your Google Cloud Translate API key",
    default: "",
  },
];

const removeBrackets = /[\[\]]/g;
let verbCache: Record<string, any> | null = null;

async function loadVerbCache(): Promise<void> {
  if (verbCache) return;
  try {
    const res = await fetch("/verbs.json");
    verbCache = await res.json();
    console.log(`Verb cache loaded: ${Object.keys(verbCache!).length} verbs`);
  } catch (err) {
    console.error("Failed to load verb cache:", err);
    verbCache = {};
  }
}

function getVerbData(infinitive: string): any | null {
  if (!verbCache) return null;
  return verbCache[infinitive] ?? null;
}

function buildRegularity(verb: any): string {
  const parts: string[] = [];
  if (verb.class) parts.push(`class: ${verb.class}`);
  const flags = [
    verb.pr_regular === "Y" ? "presente regular" : "presente irregular",
    verb.futuro_regular === "Y" ? "futuro regular" : "futuro irregular",
    verb.part_regular === "Y" ? "participio regular" : "participio irregular",
  ];
  parts.push(flags.join(", "));
  return parts.join(" — ");
}

function tenseBlock(tenseName: string, forms: string[]): any {
  // forms is always 6 items: io, tu, lui/lei, noi, voi, loro
  return {
    content: tenseName,
    children: [
      {
        //content: `| io | ${forms[0]} | noi | ${forms[3]} |\n| tu | ${forms[1]} | voi | ${forms[4]} |\n| lui/lei | ${forms[2]} | loro | ${forms[5]} |`,
        content: `| singolare | coniugazione | plurale | coniugazione | \n| io | ${forms[0]} | noi | ${forms[3]} |\n| tu | ${forms[1]} | voi | ${forms[4]} |\n| lui/lei | ${forms[2]} | loro | ${forms[5]} |`,
      },    
    ],
  };
}

function imperativoBlock(forms: string[]): any {
  // imperativo has 5 forms: tu, lui/lei, noi, voi, loro (no io)
  return {
    content: "Imperativo",
    children: [
      {
        // content: `| tu | ${forms[0]} | voi | ${forms[3]} |\n| lui/lei | ${forms[1]} | loro | ${forms[4]} |\n| — | — | noi | ${forms[2]} |`,
        content: `| singolare | coniugazione | plurale | coniugazione | \n| — | — | noi | ${forms[2]} |\n| tu | ${forms[0]} | voi | ${forms[3]} |\n| lui/lei | ${forms[1]} | loro | ${forms[4]} |`,
      }
    ],
  };
}

function buildConjugationBlocks(verb: any): any {
  const regularity = [
    verb.pr_regular === "Y" ? "presente regular" : "presente irregular",
    verb.futuro_regular === "Y" ? "futuro regular" : "futuro irregular",
    verb.part_regular === "Y" ? "participio regular" : "participio irregular",
  ].join(", ");

  const propertyLines = [
    `meaning:: ${verb.meaning}`,
    `auxiliary:: ${verb.aux}`,
    `class:: ${verb.class}`,
    `regularity:: ${regularity}`,
    `gerundio:: ${verb.gerundio}`,
    `participio passato:: ${verb.participio}`,
  ].join("\n");

  return {
    content: "conjugations",
    children: [
      { content: propertyLines },
      tenseBlock("Presente", verb.presente),
      tenseBlock("Imperfetto", verb.imperfetto),
      tenseBlock("Passato Remoto", verb.passato_remoto),
      tenseBlock("Futuro", verb.futuro),
      tenseBlock("Condizionale", verb.condizionale),
      imperativoBlock(verb.imperativo),
    ],
  };
}

async function googleTranslate(
  word: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string
): Promise<string> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: word,
      source: sourceLang,
      target: targetLang,
      format: "text",
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Google Translate error: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.data.translations[0].translatedText.toLowerCase().trim();
}

interface WiktionaryResult {
  partOfSpeech: string;
  gender: string;
  definitions: string[];
  examples: { italian: string; english: string }[];
}

async function getWiktionaryData(
  word: string,
  sourceLang: string
): Promise<WiktionaryResult | null> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const entries = data[sourceLang];
  if (!entries || entries.length === 0) return null;

  const entry = entries[0];
  const partOfSpeech = entry.partOfSpeech ?? "";

  let gender = "";
  const posLower = partOfSpeech.toLowerCase();
  const firstDefHtml = entry.definitions?.[0]?.definition ?? "";
  if (posLower.includes("feminine") || firstDefHtml.includes("feminine")) {
    gender = "feminine";
  } else if (posLower.includes("masculine") || firstDefHtml.includes("masculine")) {
    gender = "masculine";
  }

  const definitions = (entry.definitions ?? [])
    .slice(0, 4)
    .map((def: any) => stripHtml(def.definition))
    .filter((d: string) => d.length > 0);

  const examples: { italian: string; english: string }[] = [];
  for (const def of entry.definitions ?? []) {
    for (const ex of def.parsedExamples ?? []) {
      if (ex.example) {
        examples.push({
          italian: stripHtml(ex.example),
          english: stripHtml(ex.translation ?? ""),
        });
      }
    }
    if (examples.length >= 4) break;
  }

  return { partOfSpeech, gender, definitions, examples };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function waitForPage(
  pageName: string,
  retries = 10,
  delayMs = 300
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const page = await logseq.Editor.getPage(pageName);
    if (page) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function buildPage(
  word: string,
  translation: string,
  wikt: WiktionaryResult | null,
  verbData: any | null
): Promise<void> {
  await logseq.Editor.createPage(word, {}, { redirect: false });
  const ready = await waitForPage(word);
  if (!ready) throw new Error(`Page "${word}" was not ready in time`);

  const propertyLines: string[] = [];
  propertyLines.push(`translation:: ${translation}`);
  if (wikt?.partOfSpeech) {
    propertyLines.push(`part-of-speech:: ${wikt.partOfSpeech.toLowerCase()}`);
  }
  if (wikt?.gender) {
    propertyLines.push(`gender:: ${wikt.gender}`);
  }
  if (verbData) {
    propertyLines.push(`verb-form:: infinitive`);
    if (verbData.fondamentale) {
      propertyLines.push(`fundamental:: ${verbData.fondamentale}`);
    }
  }
  const blocks: any[] = [
    { content: propertyLines.join("\n") },
  ];

  if (wikt?.definitions && wikt.definitions.length > 0) {
    blocks.push({
      content: "definitions",
      children: wikt.definitions.map((d) => ({ content: d })),
    });
  }

  if (wikt?.examples && wikt.examples.length > 0) {
    blocks.push({
      content: "examples",
      children: wikt.examples.map((ex) => ({
        content: ex.italian && ex.english && ex.italian !== ex.english
          ? `${ex.italian} — ${ex.english}`
          : ex.italian || ex.english,
      })),
    });
  }

  blocks.push({ content: "notes", children: [{ content: "" }] });

  // Add conjugations if this word is an infinitive in the verb cache
  if (verbData) {
    blocks.push(buildConjugationBlocks(verbData));
  }

  // Use the auto-created empty block for our first content block
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(word);
  const firstBlock = pageBlocksTree[0];

  if (firstBlock) {
    await logseq.Editor.updateBlock(firstBlock.uuid, blocks[0].content);
    if (blocks[0].children?.length > 0) {
      await logseq.Editor.insertBatchBlock(firstBlock.uuid, blocks[0].children, {
        sibling: false,
      });
    }
    for (const block of blocks.slice(1)) {
      const inserted = await logseq.Editor.appendBlockInPage(word, block.content);
      if (inserted && block.children?.length > 0) {
        await logseq.Editor.insertBatchBlock(inserted.uuid, block.children, {
          sibling: false,
        });
      }
    }
  } else {
    for (const block of blocks) {
      const inserted = await logseq.Editor.appendBlockInPage(word, block.content);
      if (inserted && block.children?.length > 0) {
        await logseq.Editor.insertBatchBlock(inserted.uuid, block.children, {
          sibling: false,
        });
      }
    }
  }
}

async function lookup(word: string): Promise<void> {
  const sourceLang = (logseq.settings?.sourceLang as string) ?? "it";
  const targetLang = (logseq.settings?.targetLang as string) ?? "en";
  const apiKey = (logseq.settings?.googleApiKey as string) ?? "";

  if (!apiKey) {
    throw new Error("No Google Translate API key set — add it in plugin settings");
  }

  // Normalise once here so all downstream calls get clean input
  word = word.toLowerCase();

  // Ensure verb cache is ready (no-op if already loaded)
  await loadVerbCache();

  const [translation, wikt] = await Promise.all([
    googleTranslate(word, sourceLang, targetLang, apiKey),
    getWiktionaryData(word, sourceLang),
  ]);

  const verbData = getVerbData(word);
  console.log(`Verb data for "${word}":`, verbData ? "found" : "not found");

  await buildPage(word, translation, wikt, verbData);
  logseq.UI.showMsg(`Page created for "${word}" → "${translation}"`, "success");
}

async function main() {
  logseq.Editor.registerSlashCommand("Translate", async () => {
    const block = await logseq.Editor.getCurrentBlock();
    if (!block) return;
    let content = await logseq.Editor.getEditingBlockContent();
    content = content.replaceAll(removeBrackets, "").replace(/^#+/, "").trim();
    if (!content) return;
    try {
      await lookup(content);
    } catch (err) {
      logseq.UI.showMsg(`Error: ${err}`, "error");
    }
  });

  logseq.Editor.registerBlockContextMenuItem("Translate", async (e) => {
    const block = await logseq.Editor.getBlock(e.uuid);
    if (!block) return;
    let content = block.content.replaceAll(removeBrackets, "").replace(/^#+/, "").trim();
    if (!content) return;
    try {
      await lookup(content);
    } catch (err) {
      logseq.UI.showMsg(`Error: ${err}`, "error");
    }
  });
}

logseq.useSettingsSchema(settingsSchema);
logseq.ready(main).catch(() => console.error);