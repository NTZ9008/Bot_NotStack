# Graph Report - .  (2026-07-28)

## Corpus Check
- Corpus is ~8,712 words - fits in a single context window. You may not need a graph.

## Summary
- 139 nodes · 137 edges · 19 communities (8 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]

## God Nodes (most connected - your core abstractions)
1. `getAllLevels()` - 5 edges
2. `getWeatherEmbed()` - 3 edges
3. `getConfig()` - 3 edges
4. `logSpecialRole()` - 2 edges
5. `componentHandler()` - 2 edges
6. `execute()` - 2 edges
7. `execute()` - 2 edges
8. `getAllConfigs()` - 2 edges
9. `updateConfig()` - 2 edges
10. `saveAllLevelsToDB()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `execute()` --calls--> `getAllLevels()`  [EXTRACTED]
  commands/rank.js → db.js

## Import Cycles
- None detected.

## Communities (19 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (23): execute(), getWeatherEmbed(), aiUsage, badWordsFile, badWordsSet, client, { Client, GatewayIntentBits, Events, Collection, ChannelType, AuditLogEvent, Partials }, commandFiles (+15 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (19): db, dbPath, fs, getAllConfigs(), getConfig(), path, saveAllLevelsToDB(), sqlite3 (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (10): author, description, keywords, license, main, name, scripts, test (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.20
Nodes (10): dependencies, cors, discord.js, dotenv, express, express-session, @google/generative-ai, helmet (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.25
Nodes (7): componentHandler(), fs, logDir, logSpecialRole(), path, {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}, specialRoles

### Community 6 - "Community 6"
Cohesion: 0.25
Nodes (7): { clientId, guildId }, commandFiles, commands, dotenv, fs, rest, { REST, Routes }

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (6): execute(), fs, { getAllLevels }, path, { SlashCommandBuilder, EmbedBuilder }, getAllLevels()

## Knowledge Gaps
- **82 isolated node(s):** `fs`, `path`, `{
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}`, `specialRoles`, `logDir` (+77 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getAllLevels()` connect `Community 7` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `{
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._